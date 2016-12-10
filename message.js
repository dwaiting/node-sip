/* Copyright (C) David Waiting - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by David Waiting <dwaiting@gmail.com>, November 2016
 */

var os = require ('os');

const REQUEST = 'REQUEST';
const RESPONSE = 'RESPONSE';
const IFACE = 'eth0';

var options = {
  vip: '96.119.1.134',
  ip4: guessIP4Address (),
  ip6: guessIP6Address (),
  transport: 'udp',
  port: 5060
}


function guessIP6Address () {

	var interfaces = os.networkInterfaces(), address = '';

	if (typeof interfaces[IFACE] !== 'undefined') {
		interfaces[IFACE].forEach (function (inter, index, arr) {
			if (inter.family == 'IPv6' && (inter.address.search(/^fe80/) < 0)) {
				address = inter.address;
			}
		});
		return address;
	} else {
		return null;
	}
}


function guessIP4Address () {

	var interfaces = os.networkInterfaces(), address = '';

	if (typeof interfaces[IFACE] !== 'undefined') {
		interfaces[IFACE].forEach (function (inter, index, arr) {
			if (inter.family == 'IPv4') {
				address = inter.address;
			}
		});
		return address;
	} else {
		return null;
	}
}


module.exports.setIP4Address = (ip) => {
  options.ipv4 = ip;
}


module.exports.setIP6Address = (ip) => {
  options.ipv4 = ip;
}


module.exports.setPort = (port) => {
  options.port = port;
}


function parseParams (param_string) {
  const param_regex = /;([^=;]+)(?:=([^;]+))?/g;
  var params = {};
  while (param_parts = param_regex.exec (param_string)) {
    if (param_parts [2]) {
      params[param_parts[1]] = param_parts[2];
    } else {
      params[param_parts[1]] = true;
    }
  }
  Object.defineProperty(params, 'value', {
    get: () => {
      var pstring = '';
      Object.keys (params).forEach ((key) => {
        pstring += ';' + key;
        if (typeof params[key] == 'string') { pstring += '=' + params[key]; }
      });
      return pstring;
    }
  })
  return params;
}


function parseTo (to_string, callback) {
  const to_regex = /^(?:(.+)\s)?<?([^>]+)>?(;.+)?$/;
  var to_parts = to_regex.exec (to_string);
  if (to_parts) {
    parseUri (to_parts [2], (err, uri) => {
      if (err) { return callback ('Could not parse To/From header: ' + err); }
      var to = {
        value: to_parts [0],
        display_name: to_parts [1],
        uri: uri,
        params: parseParams (to_parts [3])
      }

      Object.defineProperty(to, 'value', {
        get: () => {
          return to.display_name + ' <' + to.uri.value + '>' + to.params.value;
        }
      })

      return callback (null, to);
    });
  } else {
    return callback ('Could not parse To/From header: ' + to_string);
  }
}


function parseUri (uri_string, callback) {
  const uri_regex = /^<?(sip|sips|tel):(?:([^@]+?)(?::([^@]+))?@)?([^:;>]+)(?::(\d+))?(;[^>]+)?>?$/i;
  var uri_parts = uri_regex.exec(uri_string);
  if (uri_parts) {
    var uri = {
      value: uri_parts [0],
      protocol: uri_parts [1],
      username: uri_parts [2],
      password: uri_parts [3],
      address: uri_parts [4],
      port: parseInt(uri_parts [5], 10),
      params: parseParams (uri_parts [6])
    }

    Object.defineProperty(uri, 'value', {
      get: () => {
        var ustring = uri.protocol + ':'
        if (uri.username) { ustring += uri.username; }
        if (uri.password) { ustring += ':' + uri.password; }
        if (uri.username) { ustring += '@'; }
        ustring += uri.address;
        if (uri.port) { ustring += ':' + uri.port + uri.params.value }
        return ustring;
      }
    });

    return callback (null, uri);
  } else {
    return callback ('Could not parse URI: ' + uri_string);
  }
}


function parseVia (via_string, callback) {
  const via_regex = /^SIP\/2\.0\/(UDP|TCP|TLS|SCTP)\s([\d\.]+):(\d+)(;.+)?$/;
  var via_parts = via_string.match (via_regex);
  if (via_parts) {
    var via = {
      value: via_parts [0],
      transport: via_parts [1],
      address: via_parts [2],
      port: parseInt(via_parts [3], 10),
      params: parseParams (via_parts [4])
    };

    Object.defineProperty(via, 'value', {
      get: () => {
        var vstring = 'SIP/2.0/' + via.transport + ' ' + via.address;
        if (via.port) { vstring += ':' + via.port; }
        if (via.params) { vstring += via.params.value; }
        return vstring;
      }
    });

    callback (null, via);
  } else {
    callback ('Could not parse Via header: ' + via_string);
  }
}


function parseCSeq (cseq_string, callback) {
  const cseq_regex = /^(\d+)\s([A-Z]+)?$/;
  var cseq_parts = cseq_string.match (cseq_regex);
  if (cseq_parts) {
    var cseq = {
      value: cseq_parts [0],
      number: parseInt(cseq_parts [1], 10),
      method: cseq_parts [2]
    };

    Object.defineProperty(cseq, 'value', {
      get: () => {
        return cseq.number + ' ' + cseq.method;
      }
    });

    callback (null, cseq);
  } else {
    callback ('Could not parse CSeq header: ' + cseq_string);
  }
}


function parseRequestLine (request_line_string, callback) {
  const request_line_regex = /^(INVITE|ACK|BYE|CANCEL|OPTIONS|REGISTER|PRACK|SUBSCRIBE|NOTIFY|PUBLISH|INFO|REFER|MESSAGE|UPDATE)\s(.+)\s(SIP\/2.0)$/i;
  var request_parts = request_line_regex.exec (request_line_string);

  if (request_parts) {
    parseUri (request_parts [2], (err, uri) => {
      if (err) { return callback ('Could not parse Request-URI: ' + err); }
      var request_line = {
        value: request_parts [0],
        method: request_parts [1],
        uri: uri,
        version: request_parts [3]
      }

      Object.defineProperty(request_line, 'value', {
        get: () => {
          return request_line.method + ' ' + request_line.uri.value + ' ' + request_line.version;
        }
      });

      callback (null, request_line);
    })
  } else {
    callback ('Could not parse Request-URI')
  }
}


function parseResponseLine (response_line_string, callback) {
  const response_line_regex = /^(SIP\/2\.0)\s(\d{3})\s(.+)$/i;
  var response_parts = response_line_regex.exec (response_line_string);
  if (response_parts) {
    var response_line = {
      value: response_parts [0],
      version: response_parts [1],
      code: parseInt(response_parts [2], 10),
      reason: response_parts [3]
    }

    Object.defineProperty(response_line, 'value', {
      get: () => {
        return response_line.version + ' ' + response_line.code + ' ' + response_line.reason;
      }
    });

    callback (null, response_line);
  } else {
    callback ('Could not parse: ' + response_line_string);
  }
}


module.exports.parseMessage = (msg, callback) => {
  if (!options.ip4 && !options.ip6) { return callback ('No IP address provided and could not guess.'); }

  var msg_arr = msg.split ('\r\n\r\n');
  var headers = msg_arr.shift().split ('\r\n');
  var start_line = headers.shift();
  var content = msg_arr.pop();
  var fatal_parse_error = false;
  var message;

  var request_matches = start_line.match (/^(INVITE|ACK|BYE|CANCEL|OPTIONS|REGISTER|PRACK|SUBSCRIBE|NOTIFY|PUBLISH|INFO|REFER|MESSAGE|UPDATE)\s(.+)\sSIP\/2.0$/i);
  var response_matches = start_line.match (/^SIP\/2\.0\s(\d{3})\s(.+)$/i);

  if (request_matches) {
    message = new SipRequest (request_matches [1], request_matches [2]);
  } else if (response_matches) {
    message = new SipResponse (parseInt(response_matches [1], 10), response_matches [2]);
  } else {
    return callback ('Invalid start line: ' + start_line);
  }

  if (!message) { return callback ('Could not create parsed message'); }

  headers.forEach ((header) => {
    if (fatal_parse_error) { return; }
    var header_parts = header.match (/^([^:]+?):\s?(.+)$/);
    if (!header_parts) {
      return callback ('Invalid header');
    }
    var key = header_parts[1];
    var value = header_parts[2];
    switch (key.toLowerCase().trim()) {
      case 'via':
      case 'v':
        value.split (',').forEach ((elem) => {
          parseVia (elem.trim (), (err, via) => {
            if (err) {
              fatal_parse_error = true;
              return callback (err);
            }
            message.appendVia (via);
          });
        });
        break;
      case 'from':
      case 'f':
        parseTo (value, (err, from) => {
          if (err) {
            fatal_parse_error = true;
            return callback (err);
          }
          message.setFrom (from);
        });
        break;
      case 'to':
      case 't':
        parseTo (value, (err, to) => {
          if (err) {
            fatal_parse_error = true;
            return callback (err);
          }
          message.setTo (to);
        });
        break;
      case 'route':
        value.split (',').forEach ((elem) => {
          parseUri (elem.trim (), (err, route) => {
            if (err) { return callback (err); }
            message.appendRoute (route);
          });
        });
        break;
      case 'record-route':
        value.split (',').forEach ((elem) => {
          parseUri (elem.trim (), (err, rr) => {
            if (err) { return callback (err); }
            message.appendRecordRoute (rr);
          });
        });
        break;
      case 'call-id':
      case 'i':
        message.setCid ({ value: value });
        break;
      case 'cseq':
        parseCSeq (value, (err, cseq) => {
          if (err) { return callback (err); }
          message.setCSeq (cseq);
        })
        break;
      case 'contact':
      case 'm':
        parseUri (value, (err, contact) => {
          if (err) { return callback (err); }
          message.setContact (contact);
        });
        break;
    case 'max-forwards':
      message.setMaxforwards ({ value: parseInt(value, 10)});
      break;
    case 'content-length':
      break;
    default:
      message.setHeader (key, { value: value });
    }
  });

  if (content) { message.setContent (content); }
  if (!fatal_parse_error) { callback (null, message); }
}


function createVia (callback) {
  var via_string = 'SIP/2.0/' + options.transport.toUpperCase()+ ' ' + options.vip + ':' + options.port + ';branch=z9hG4bK-' + Math.floor(Math.random() * 1000000);
  parseVia (via_string, (err, via) => {
      if (err) { return callback ('Could not create Via header'); }
      return callback (null, via);
  });
}


function createRecordRoute (callback) {
  var rr_string = 'sip:' + options.vip + ':' + options.port + ';lr';
  parseUri (rr_string, (err, rr) => {
      if (err) { return callback ('Could not create Record-Route header'); }
      return callback (null, rr);
  });
}


class SipMessage {
  constructor () {
    this.headers = {};
    this.headers['Via'] = [];
    this.content = '';
  }

  isRequest () {
    return (this.type === REQUEST);
  }

  isResponse () {
    return (this.type === RESPONSE);
  }

  setTo (to) {
    this.headers['To'] = to;

  }

  setFrom (from) {
    this.headers['From'] = from;
  }

  setCSeq (cseq) {
    this.headers['CSeq'] = cseq;
  }

  setCid (cid) {
    this.headers['Call-ID'] = cid;
  }

  setContact (contact) {
    this.headers['Contact'] = contact;
  }

  setRecordRoutes (rr) {
    this.headers['Record-Route'] = rr;
  }

  setMaxforwards (maxforwards) {
    this.headers['Max-Forwards'] = maxforwards;
  }

  setVia (via) {
    this.headers['Via'] = via;
  }

  setOtherHeader (key, value) {
    if (!this.headers.other) { this.headers.other = {}; }
    this.headers.other[key] = value;
  }

  setHeader (key, value) {
    this.headers[key] = value;
  }

  appendVia (via) {
    if (!this.headers['Via']) { this.headers['Via'] = []; }
    this.headers['Via'].push (via);
  }

  prependVia () {
    if (!this.headers['Via']) { this.headers['Via'] = []; }
    createVia ((err, via) => {
      if (err) {
        console.log (err);
        return;
      }
      this.headers['Via'].unshift (via);
    });
  }

  appendRecordRoute (rr) {
    if (!this.headers['Record-Route']) { this.headers['Record-Route'] = []; }
    this.headers['Record-Route'].push (rr);
  }

  prependRecordRoute () {
    if (!this.headers['Record-Route']) { this.headers['Record-Route'] = [] }
    createRecordRoute ((err, rr) => {
      if (err) { return null; }
      this.headers['Record-Route'].unshift (rr);
    });
  }

  setContent (content) { this.content = content; }

  setSourceAddress (address) {
    this.saddress = address;

    if (this.type == REQUEST && this.headers['Via'][0].address != address) {
      this.headers['Via'][0].params['received'] = address;
    }
  }

  getSourceAddress () { return this.saddress; }

  setSourcePort (port) {
    this.sport = port;

    if (this.type == REQUEST && this.headers['Via'][0].port != port && this.headers['Via'][0].params['rport']) {
      this.headers['Via'][0].params['rport'] = port.toString ();
    }
  }

  getSourcePort () { return this.sport; }

  setDestinationAddress (address) {
    this.daddress = address;
  }

  getDestinationAddress () { return this.daddress; }

  setDestinationPort (port) {
    this.dport = port ? port : 5060;
  }

  getDestinationPort () { return this.dport; }

  setDestination (address, port) {
    this.daddress = address;
    this.dport = port ? port : 5060;
  }

  getBranch (branch = 0) {
    return (this.headers['Via'][branch].params.branch) ? this.headers['Via'][branch].params.branch : null;
  }


  toString () {
    var mstring = (this.type == REQUEST) ? (this['Request-Line'].value + '\r\n') : (this['Response-Line'].value + '\r\n');

    Object.keys (this.headers).forEach ((key) => {
      if (Array.isArray(this.headers [key])) {
        if (this.headers[key].length > 0) {
          if (key == 'Via') {
            this.headers[key].forEach ((via) => {
              mstring += key + ': ' + via.value + '\r\n';
            });
          } else {
            mstring += key + ': <' + this.headers [key].map (function (elem){ return elem.value; }).join('>,<') + '>\r\n';
          }
        }
      } else {
        mstring += key + ': ' + this.headers [key].value + '\r\n';
      }
    });

    mstring += 'Content-Length: ' + this.content.length + '\r\n\r\n';
    mstring += this.content;
    return mstring;
  }
}


class SipRequest extends SipMessage {
  constructor (method, uri) {
    super ();
    this.type = REQUEST;

    parseRequestLine (method + ' ' + uri + ' SIP/2.0', (err, request_line) => {
      if (err) {
        return null;
      }
      this['Request-Line'] = request_line;
    });
  }

  isInvite () { return (this.getMethod ()  === 'INVITE'); }
  isOptions () { return (this.getMethod ()  === 'OPTIONS'); }
  isAck () { return (this.getMethod () === 'ACK'); }
  isBye () { return (this.getMethod ()  === 'BYE'); }

  inDialog () {
    return (typeof this.headers['To'].params.tag != 'undefined');
  }

  setRequestLine (rline) { this['Request-Line'] = rline; }

  getRequestLine () { return this['Request-Line']; }

  getRequestURI () { return this['Request-Line'].uri.value; }

  getMethod () {
    return this['Request-Line'].method;
  }

  setMethod (method) {
    this['Request-Line'].method = method;
  }

  setRoute (route) {
    this.headers['Route'] = route;
  }

  appendRoute (route) {
    if (!this.headers['Route']) { this.headers['Route'] = []; }
    this.headers['Route'].push (route);
  }

  removeRoute () {
    if (this.headers['Route'] && (this.headers['Route'][0].address === options.ip4 || this.headers['Route'][0].address === options.ip6 || this.headers['Route'][0].address == options.vip)) {
        if (!this.headers['Route'][0].port || (this.headers['Route'][0].port == options.port)) {
          this.headers['Route'].splice (0, 1);
        }
    }
  }

  nextHop () {
    var nexthop = {};
    if (this.daddress) {
      nexthop.address = this.daddress;
      nexthop.port = this.dport ? this.dport : 5060;
    } else if (this.headers['Route'] && this.headers['Route'].length > 0) {
      nexthop.address = this.headers['Route'][0].address;
      nexthop.port = (this.headers['Route'][0].port) ? this.headers['Route'][0].port : 5060;
    } else {
      nexthop.address = this['Request-Line'].uri.address;
      nexthop.port = (this['Request-Line'].uri.port) ? this['Request-Line'].uri.port : 5060;
    }
    return nexthop;
  }

  decMaxForwards (callback) {
    if (this.headers['Max-Forwards'].value > 0) {
      this.headers['Max-Forwards'].value --;
      callback (null);
    } else {
      callback ('Too many hops');
    }
  }

  buildTrying (callback) {
    var response = new SipResponse (100, 'Trying');
    response.setTo (this.headers['To']);
    response.setFrom (this.headers['From']);
    response.setCSeq (this.headers['CSeq']);
    response.setCid (this.headers['Call-ID']);
    response.setVia (this.headers['Via']);
    response.setDestinationAddress (this.getSourceAddress ());
    response.setDestinationPort (this.getSourcePort ());
    callback (null, response);
  }

  buildSuccess (callback) {
    var response = new SipResponse (200, 'OK');
    response.setTo (this.headers['To']);
    response.setFrom (this.headers['From']);
    response.setCSeq (this.headers['CSeq']);
    response.setCid (this.headers['Call-ID']);
    response.setVia (this.headers['Via']);
    response.addToTag ();
    response.setDestinationAddress (this.saddress);
    callback (null, response);
  }

  buildRequest (callback) {
    var request = new SipRequest (this.getMethod (), this.getRequestURI ());
    request.headers = JSON.parse (JSON.stringify (this.headers));
    request.content = this.content;

    request.decMaxForwards ((err) => {
      if (err) { return callback (err); }
      request.prependVia ();
      request.removeRoute ();
      if (request.isInvite()) { request.prependRecordRoute (); }
      callback (null, request);
    });
  }
}


class SipResponse extends SipMessage {
  constructor (code, reason) {
    super ();
    this.type = RESPONSE;

    parseResponseLine ('SIP/2.0 ' + code + ' ' + reason, (err, response_line) => {
      if (err) { return null; }
      this['Response-Line'] = response_line
    });
  }

  getCode () { return this['Response-Line'].code; }
  getReason () { return this['Response-Line'].reason; }
  getMethod () { return this.headers['CSeq'].method; }

  isInvite () { return this.getMethod () == 'INVITE'; }

  isTrying () { return this.getCode () == 100}
  isProvisional () { return (this.getCode () > 100 && this.getCode () < 200) }
  isSuccess () { return (this.getCode () >= 200 && this.getCode () < 300) }
  isRedirect () { return (this.getCode () >= 300 && this.getCode () < 400) }
  isFailure () { return (this.getCode () >= 400 && this.getCode () < 700)}

  removeTopVia () {
    //if ((this.headers['Via'][0].address == options.vip || this.headers['Via'][0].address == options.ip6) && this.headers['Via'][0].port == options.port) {
      this.headers['Via'].splice (0, 1);
    //}
  }

  addToTag () {
    this.headers['To'].params['tag'] = Math.floor(Math.random() * 1000000);
  }

  nextHop () {
    //var nexthop = {
    //  address: this.getDestinationAddress (),
    //  port: this.getDestinationPort ()
      //port: (this.headers['Via'][0].port) ? this.headers['Via'][0].port : 5060
    //};

    /*
    if (this.headers['Via'][0].params['received']) {
      nexthop.address = this.headers['Via'][0].params['received'];
      nexthop.port = (this.headers['Via'][0].port) ? this.headers['Via'][0].port : 5060;
    } else {
      nexthop.address = this.headers['Via'][0].address;
      nexthop.port = (this.headers['Via'][0].port) ? this.headers['Via'][0].port : 5060;
    }
    */

    var nexthop = {
      address: this.headers['Via'][0].address,
      port: (this.headers['Via'][0].port) ? this.headers['Via'][0].port : 5060
    }
    return nexthop;
  }

  buildResponse (callback) {
    var response = new SipResponse (this.getCode (), this.getReason ());
    response.headers = JSON.parse (JSON.stringify (this.headers));
    response.content = this.content;
    response.removeTopVia ();
    //response.setDestinationAddress (this.getSourceAddress ());
    //response.setDestinationPort (this.getSourcePort ());
    callback (null, response);
  }

  buildAck (callback) {
    var ack = new SipRequest ('ACK', this.getRequestURI ());
    ack.setTo (this.headers['To']);
    ack.setFrom (this.headers['From']);
    ack.setCSeq (this.headers['CSeq']);
    ack.headers['CSeq'].method = 'ACK';
    ack.setCid (this.headers['Call-ID']);
    ack.setVia (this.headers['Via']);
    callback (null, ack);
  }
}
