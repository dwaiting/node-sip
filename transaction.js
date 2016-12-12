const EventEmitter = require ('events');
const crypto = require ('crypto');
const redis = require ('redis');
var options = require ('./options.js');

var tl;
var db;

function multiSend (address, port, tid, message, state, interval, max, timer, callback) {

  db.hget (tid, 'state', (err, current_state) => {
    if (err) { return callback ('Error: Could not find transaction state: ' + tid); }
    if (current_state == state) {
      tl.emit ('transport', address, port, message);
      setTimeout (() => {
        interval *= 2;
        multiSend (address, port, tid, message, state, interval, max, timer, callback);
      }, max ? Math.min (interval, max) : interval);
    } else {
      clearTimeout (timer);
    }
  });
}

function send (address, port, tid, message, state, interval, max, timeout, callback) {
  var timer = setTimeout (() => {
    db.hget (tid, 'state', (err, current_state) => {
      if (state == current_state) {
        db.del (tid, (err, reply) => {
          if (err) { return callback ('DB Error: ' + err); }
          return callback ('Transaction timeout: ' + tid);
        });
      }
    });
  }, timeout);

  multiSend (address, port, tid, message, state, interval, max, timer, (err) => {
    if (err) { return callback (err); }

  });

  return callback (null);
}


function createInviteServerTransaction(invite, saddress, sport, callback) {
  var transaction = new InviteServerTransaction (invite.getBranch());

  db.hmset(transaction.tid, 'state', transaction.state, 'type', transaction.type, 'saddress', saddress, 'sport', sport, (err, reply) => {
    if (err) { return callback('Error setting transaction state in DB: ' + err); }

    console.log(transaction.tid + ' - New IST - Current state: ' + transaction.state);

    db.expire(transaction.tid, options.istExpire, (err, reply) => {
      if (err) { return callback('Error setting transaction expiry in DB: ' + err); }

      tl.emit ('user', invite);
      callback (null);
    });
  });
}


function createInviteClientTransaction(invite, daddress, dport, callback) {
  var transaction = new InviteClientTransaction(invite.getBranch());

  db.hmset (transaction.tid, 'state', transaction.state, 'type', transaction.type, 'daddress', daddress, 'dport', dport, (err, reply) => {
    if (err) { return callback('Error setting transaction state in DB: ' + err); }

    console.log(transaction.tid + ' - New ICT - Current state: ' + transaction.state);

    db.expire(transaction.tid, options.ictExpire, (err, reply) => {
      if (err) { return callback ('Error setting transaction expiry in DB: ' + err); }

      send(daddress, dport, transaction.tid, invite.toString(), 'calling', options.t1, null, options.t1 * 64, (err) => {
        if (err) { return callback(err); }
        callback (null);
      });
    });
  });
}


function createNonInviteServerTransaction (request, saddress, sport, callback) {
  var transaction = new NonInviteServerTransaction (request.getBranch(), request.getMethod());

  console.log(transaction.tid + ' - New NIST: ' + request.getMethod() + ' - Current state: ' + transaction.state);

  db.hmset (transaction.tid, 'state', transaction.state, 'type', transaction.type, 'saddress', saddress, 'sport', sport, (err, reply) => {
    if (err) { return callback ('Error setting transaction state in DB: ' + err); }

    db.expire (transaction.tid, options.nistExpire, (err, reply) => {
      if (err) { return callback ('Error setting transaction expiry in DB: ' + err); }
      tl.emit ('user', request);
      callback (null);
    });
  });
}


function createNonInviteClientTransaction (request, daddress, dport, callback) {
  var transaction = new NonInviteClientTransaction (request.getBranch(), request.getMethod());

  console.log(transaction.tid + ' - New NICT - ' + request.getMethod() + '- Current state: ' + transaction.state);

  db.hmset (transaction.tid, 'state', transaction.state, 'type', transaction.type, (err, reply) => {
    if (err) { return callback ('Error setting transaction state in DB: ' + err); }

    db.expire (transaction.tid, options.nictExpire, (err, reply) => {
      if (err) { return callback ('Error setting transaction expiry in DB: ' + err); }

      send (daddress, dport, transaction.tid, request.toString(), 'trying', options.t1, options.t2, options.t1 * 64, (err) => {
        if (err) { return callback (err); }
      });

      callback (null);
    });
  });
}


function processInviteClientRequest (tid, state, type, request, callback) {
    // not needed - TU shouldn't be sending us the same request more than once
    return callback ('TU sending same request twice');
}

function processInviteClientResponse (tid, state, type, daddress, dport, response, callback) {

  var code = response.getCode();

  if (type != 'ict') { return callback ('Wrong transaction type for ' + code + '. Expected: ict; Received: ' + type); }

  console.log(tid + ' - ICT Response - Current state: ' + state + ' - Processing: ' + code);

  if (state === 'calling') {
    if (code >= 100 && code < 200) {
      db.hset(tid, 'state', 'proceeding', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: proceeding');
        tl.emit('user', response);
      });
    }

    if (code >= 200 && code < 300) {
      db.del(tid, (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: terminated');
        tl.emit('user', response);
        response.buildAck((err, ack) => {
          tl.emit('transport', daddress, dport, ack.toString ());
        });
      });
    }

    if (code >= 300 && code < 700) {
      db.hset (tid, 'state', 'completed', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: completed');
        tl.emit('user', response);
      });
    }
  }

  if (state === 'proceeding') {
    if (code >= 100 && code < 200) {
      tl.emit('user', response);
    }

    if (code >= 200 && code < 300) {
      db.del(tid, (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: terminated');
        tl.emit('user', response);
      });
    }

    if (code >= 300 && code < 700) {
      db.hset(tid, 'state', 'completed', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: completed');
        tl.emit('user', response);

        response.buildAck ((err, ack) => {
          tl.emit('transport', daddress, dport, ack.toString());

          if (options.transport === 'udp') {
            setTimeout(() => {
              db.del(tid, (err, reply) => {
                if (err) { return callback('Database error: ' + err); }
                console.log(tid + ' - timed out - New state: terminated');
              });
            }, options.timer_d);
          } else {
            db.del(tid, (err, reply) => {
              if (err) { return callback('Database error: ' + err); }
              console.log(tid + ' - New state: terminated');
            });
          }
        });
      });
    }
  }

  if (state == 'completed') {
    if (code >= 300 && code < 700) {
      response.buildAck((err, ack) => {
        tl.emit('transport', daddress, dport, ack.toString ());
      });
    }
  }
}


function processNonInviteClientRequest(tid, state, type, request, callback) {
  return callback('TU sending same request twice');
}

function processNonInviteClientResponse(tid, state, type, response, callback) {

  var code = response.getCode();

  if (type !== 'nict') { return callback('Wrong transaction type for ' + code + '. Expected: nict; Received: ' + type); }

  console.log(tid + ' - NICT Response - ' + response.getMethod() + ' - Current state: ' + state + ' - Processing ' + code);

  if (state === 'trying') {
    if (code >= 100 && code < 200) {
      db.hset(tid, 'state', 'proceeding', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: proceeding');
        tl.emit('user', response);
      });
    }

    if (code >= 200 && code < 700) {
      db.hset(tid, 'state', 'completed', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: completed');
        tl.emit('user', response);

        setTimeout(() => {
          db.del(tid, (err, reply) => {
            if (err) { return callback('Database error: ' + err); }
            console.log(tid + ' - Timer K expired - New state: terminated');
          });
        }, options.timer_k);
      });
    }
  }

  if (state === 'proceeding') {
    if (code >= 100 && code < 200) {
      tl.emit ('user', response);
    }

    if (code >= 200 && code < 700) {
      db.hset(tid, 'state', 'completed', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: completed');
        tl.emit('user', response);

        setTimeout(() => {
          db.del(tid, (err, reply) => {
            if (err) { return callback('Database error: ' + err); }
            console.log(tid + ' - Timer K expired - New state: terminated');
          });
        }, options.timer_k);
      });
    }
  }
}


function processInviteServerRequest(tid, state, type, saddress, sport, request, callback) {
  // this is a retransmission
  console.log(tid + ' - IST Request - ' + request.getMethod() + ' - Current state: ' + state + ' - Processing retransmission');

  if (type !== 'ist') { return callback ('Wrong transaction type for ' + request.getMethod () + '. Expected: ist; Received: ' + type); }

  if (state === 'proceeding') {
    if(request.isInvite()) {
      db.hget(tid, 'response', (err, response) => {
        if (err) { return callback('Database error: ' + err); }
        if (response) { tl.emit ('transport', saddress, sport, response); }
      });
    }
  }

  if (state === 'completed') {
    if (request.isInvite()) {
      db.hget (tid, 'response', (err, response) => {
        if (err) { return callback('Database error: ' + err); }
        if (response) { tl.emit('transport', saddress, sport, response); }
      });
    }

    if (request.isAck()) {
      if (state === 'completed') {
        db.hset(tid, 'state', 'confirmed', (err, reply) => {
          if (err) { return callback('Database error: ' + err); }
          console.log(tid + ' - IST - ACK - New state: confirmed : ' + reply);
          tl.emit('user', request);

          setTimeout(() => {
            db.del(tid, (err, reply) => {
              if (err) { return callback('Database error: ' + err); }
              console.log(tid + ' - IST - Timer I expired - New state: terminated');
            });
          }, options.timer_i);
        });
      }
    }
  }

  return callback(null);
}

function processInviteServerResponse(tid, state, type, saddress, sport, response, callback) {

  var code = response.getCode();

  if (type != 'ist') { return callback('Wrong transaction type for ' + code + '. Expected: ist; Received: ' + type); }

  console.log(tid + ' - IST Response - current state: ' + state + ' Processing: ' + code);

  if (state === 'proceeding') {

    // save response in case we need to send it again
    db.hset(tid, 'response', response.toString(), (err, reply) => {
      if (err) { return callback('Database error: ' + err); }
    });

    if (code >= 100 && code < 200) {
      tl.emit('transport', saddress, sport, response.toString());
    }

    if (code >= 200 && code < 300) {
      db.del(tid, (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: terminated');
        tl.emit('transport', saddress, sport, response.toString());
      });
    }

    if (code >= 300 && code < 700) {
      db.hset(tid, 'state', 'completed', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: completed');

        send(saddress, sport, response.toString(), 'completed', options.t1, options.t2, options.t1 * 64, (err) => {
          if (err) { return callback ('Error sending response: ' + err); }

          setTimeout(() => {
            db.del(tid, (err, reply) => {
              if (err) { return callback('Database error: ' + err); }
              console.log(tid + ' - Timer I expired - New state: terminated');
            });
          }, options.t1 * 64);
        })
      });
    }
  }

  return callback(null);
}


function processNonInviteServerRequest(tid, state, type, saddress, sport, request, callback) {
  // this is a retransmission

  console.log (tid + ' - NIST Request - ' + request.getMethod() + ' - Current state: ' + state + ' - Processing retransmission');

  if (type !== 'nist') { return callback ('Wrong transaction type for ' + request.getMethod () + '. Expected: nist; Received: ' + type); }

  if (state === 'proceeding') {
    db.hget(tid, 'response', (err, response) => {
      if (err) { return callback('Database error: ' + err); }
      if (response) { tl.emit('transport', saddress, sport, response); }
    });
  }

  if (state === 'completed') {
    db.hget(tid, 'response', (err, response) => {
      if (err) { return callback('Database error: ' + err); }
      if (response) { tl.emit('transport', saddress, sport, response); }
    });
  }

  return callback (null);
}


function processNonInviteServerResponse(tid, state, type, saddress, sport, response, callback) {

  var code = response.getCode();

  console.log(tid + ' - NIST Response - ' + response.getMethod () + ' - Current state: ' + state + ' - Processing: ' + code);

  if (type != 'nist') { return callback('Wrong transaction type for ' + code + '. Expected: nist; Received: ' + type); }

  if (state === 'trying') {

    // save response in case we need to send it again
    db.hset(tid, 'response', response.toString (), (err, reply) => {
      if (err) { return callback('Database error: ' + err); }
    });

    if (code >= 100 && code < 200) {
      db.hset(tid, 'state', 'proceeding', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: proceeding');
        tl.emit('transport', saddress, sport, response.toString ());
      });
    }

    if (code >= 200 && code < 700) {
      db.hset(tid, 'state', 'completed', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log (tid + ' - New state: completed');
        tl.emit('transport', saddress, sport, response.toString ());

        setTimeout(() => {
          db.del(tid, (err, reply) => {
            if (err) { return callback('Database error: ' + err); }
            console.log(tid + ' - Timer J expired - New state: terminated');
          });
        }, options.timer_j);
      });
    }
  }

  if (state === 'proceeding') {

    // save response in case we need to send it again
    db.hset(tid, 'response', response.toString(), (err, reply) => {
      if (err) { return callback('Database error: ' + err); }
    });

    if (code >= 100 && code < 200) {
      tl.emit('transport', saddress, sport, response.toString());
    }

    if (code >= 200 && code < 700) {
      db.hset(tid, 'state', 'completed', (err, reply) => {
        if (err) { return callback('Database error: ' + err); }
        console.log(tid + ' - New state: completed');
        tl.emit('transport', saddress, sport, response.toString());

        setTimeout(() => {
          db.del(tid, (err, reply) => {
            if (err) { return callback('Database error: ' + err); }
            console.log (tid + ' - Timer J expired - New state: terminated');
          });
        }, options.timer_j);
      });
    }
  }
}


function fromTransport (message, saddress, sport, callback) {

  var transaction, tid = tidHash (message.getBranch(), message.getMethod());

  if (message.isRequest()) {

    db.hmget(tid, 'state', 'type', (err, replies) => {
      var state    = replies[0];
      var type     = replies[1];

      if (state === null) {
        // new server transaction
        if (message.isInvite()) {
          createInviteServerTransaction(message, saddress, sport, (err) => {
            if (err) { return callback('Could not create Invite server transaction: ' + err); }
          });
        } else if (message.isAck()) {
          tl.emit ('user', message);
        } else {
          createNonInviteServerTransaction(message, saddress, sport, (err) => {
            if (err) { return callback('Could not create Non-Invite server transaction: ' + err); }
          });
        }
      } else {
        // existing server transaction
        if (message.isInvite() || message.isAck()) {
          processInviteServerRequest(tid, state, type, saddress, sport, message, (err) => {
            if (err) { return callback(err); }
          });
        } else {
          processNonInviteServerRequest(tid, state, type, saddress, sport, message, (err) => {
            if (err) { return callback (err); }
          });
        }
      }
    });

  } else if (message.isResponse()) {

    db.hmget(tid, 'state', 'type', 'daddress', 'dport', (err, replies) => {
      var state    = replies[0];
      var type     = replies[1];
      var daddress = replies[2];
      var dport    = replies[3];

      if (state === null) {
        // drop - should never get response we don't recognize
        return callback('Cannot find this transaction in DB: ' + tid);
      } else {
        // existing transaction
        if (message.getMethod() === 'INVITE') {
          processInviteClientResponse(tid, state, type, daddress, dport, message, callback);
        } else {
          processNonInviteClientResponse (tid, state, type, message, callback);
        }
      }
    });
  }
  callback(null);
}


function fromUser(message, arg1, arg2, arg3) {

  var daddress, dport, callback;
  if (typeof arg1 === 'function') {
    callback = arg1;
  } else if (typeof arg2 === 'function') {
    daddress = arg1;
    callback = arg2;
  } else {
    daddress = arg1;
    dport    = arg2;
    callback = arg3;
  }

  var tid = tidHash(message.getBranch(), message.getMethod());

  if (message.isRequest()) {

    if (!daddress) {
      daddress = message.nextHop.address;
      dport = message.nextHop.port;
    } else if (!dport) {
      dport = 5060;
    }

    db.hmget(tid, 'state', 'type', (err, replies) => {
      var state = replies[0];
      var type  = replies[1];

      if (state === null) {
        // new client transaction
        if (message.isInvite()) {
          createInviteClientTransaction (message, daddress, dport, callback);
        } else if (message.isAck()) {
          tl.emit ('transport', daddress, dport, message.toString());
        } else {
          createNonInviteClientTransaction(message, daddress, dport, callback);
        }
      } else {
        // drop - TU shouldn't be sending us the same request twice!
        return callback('TU trying to send existing request');
      }
    });
  } else if(message.isResponse()) {
    db.hmget(tid, 'state', 'type', 'saddress', 'sport', (err, replies) => {
      var state    = replies[0];
      var type     = replies[1];
      var saddress = replies[2];
      var sport    = replies[3];

      if (state === null) {
        // drop - should never get response we don't recognize
        return callback('Cannot find associated transaction for this response');
      } else {
        if (message.isInvite()) {
          processInviteServerResponse(tid, state, type, saddress, sport, message, callback);
        } else {
          processNonInviteServerResponse (tid, state, type, saddress, sport, message, callback);
        }
      }
    });
  }
}


function tidHash(branch, method) {
  return crypto.createHash('md5').update(branch + method).digest('hex');
}

class Transaction {
  constructor(branch, method) {
    this.tid = tidHash(branch, method);
    this.state = null;
  }
}

class InviteClientTransaction extends Transaction {
  constructor(branch) {
    super(branch, 'INVITE');
    this.state   = 'calling';
    this.type    = 'ict';
  }
}

class NonInviteClientTransaction extends Transaction {
  constructor(branch, method) {
    super(branch, method);
    this.state   = 'trying';
    this.type    = 'nict';
  }
}

class InviteServerTransaction extends Transaction {
  constructor(branch) {
    super(branch, 'INVITE');
    this.state   = 'proceeding';
    this.type    = 'ist';
  }
}

class NonInviteServerTransaction extends Transaction {
  constructor(branch, method) {
    super(branch, method);
    this.state   = 'trying';
    this.type    = 'nist';
  }
}

class TransactionLayer extends EventEmitter {
  fromUser() { fromUser(...arguments); }
  fromTransport() { fromTransport(...arguments); }
}

module.exports.initTransactionLayer = (options) => {
  tl = new TransactionLayer();
  db = redis.createClient(options.db);

  db.on("error", function (err) {
    if (err) { tl.emit ('error', 'DB error: ' + err); }
  });
  return tl;
}
