# node-sip
SIP library for Node.js

# Example

    const sip = require ('node-sip');
    const dgram = require ('dgram');

    const socket = dgram.createSocket ('udp4');
    const tl = sip.initTransactionLayer ();

    tl.on ('error', (err) => {
      console.log (err);
    });

    tl.on ('transport', (address, port, message) => {
      socket.send (port, address, message);
    });

    tl.on ('user', (message) => {
      if (message.isInvite ()) {
        message.buildTrying ((err, trying) => {
            tl.fromUser (trying);
        });
      }
    });

    socket.on ('error', (err) => {
      console.log ('Socket error ' + err);
    });

    socket.on ('message', (message) => {
      sip.parseMessage (message, (err, parsed_message) => {
        tl.fromTransport (parsed_message, (err) => {
            if err { return; }
        });
      });
    });

    socket.bind (5060);
