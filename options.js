module.exports = {
	transport: 			'udp',        // {udp, tcp, ws}
	interfaceName: 	'eth0',		  	// {eth0, lo, ...}
	ip4:						'96.119.1.39',
	ip6: 						'',
	ipVersion: 			4,			  		// {4, 6}
	port : 					5060,		  		// {[number], null}
	vip:						'96.119.1.134',
	fqdn:						'',
	stand_alone:		true,					// false = distributed IO and processsing
	t1: 						500,          // default: 500ms
	t2:							4000,					// default: 4s
	t4:							5000,					// default: 5s
	timer_d:				32000,				// 32s
	timer_h:				32000,				// 64 * T1
	timer_i:				5000,					// T4
	timer_j:				32000,				// 64 * T1
	timer_k:				5000,					// T4
	retransmit:			0,			  		// default: 6 (2^6 = 64 times the t1 timer, default 32 seconds)
	poll:						200,			  	// frequency to check for new messages
	destinations:		[{address: '96.119.1.54', port: 5060, capacity: 100, weight: 10}], //, {address: '96.119.1.44', port: 5060, capacity: 100, weight: 10}],
	lbmethod:				'rr',					// {rr, weighted, least_busy}
	istExpire:			300,					// expire IST in DB; default 300s
	ictExpire:			300, 					// expire ICT in DB; default 300s
	nistExpire:			60,						// expire NIST in DB; default 60s
	nictExpire:			60						// expire NICT in DB; default 60s
}
