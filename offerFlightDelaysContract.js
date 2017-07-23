/*jslint node: true */
'use strict';
const offerContract = require('./offerContract');
const moment = require('moment');
const db = require('byteballcore/db');

module.exports = (myAddress, event_date, contract, cb) => {
	let arrFlightName = contract.feed_name.split(' ');
	let m = moment(arrFlightName[1], 'DD.MM.YYYY');
	contract.feed_name = arrFlightName[0] + '-' + m.format('YYYY-MM-DD');

	offerContract(myAddress, event_date, contract, (err, paymentRequestText, shared_address) => {
		if (err) return cb(err);
		insertContract(contract.feed_name, m.format('YYYY-MM-DD') + ' 23:59:59', contract.feedValue, shared_address, contract.peerAddress, contract.peerDeviceAddress, contract.peerAmount, contract.peerAsset);
		cb(err, paymentRequestText);
	});
};


function insertContract(feed_name, date, delay, shared_address, peer_address, peer_device_address, peer_amount, peer_asset) {
	db.query("INSERT INTO contracts (feed_name, date, delay, shared_address, peer_address, peer_device_address, peer_amount, peer_asset) VALUES(?,?,?,?,?,?,?,?)",
		[feed_name, date , delay, shared_address, peer_address, peer_device_address, peer_amount, peer_asset], () => {})
}