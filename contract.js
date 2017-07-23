/*jslint node: true */
'use strict';

const db = require('byteballcore/db');
const device = require('byteballcore/device');
const headlessWallet = require('headless-byteball');
const async = require('async');
const conf = require('byteballcore/conf');

exports.checkAndRefundContractsTimeout = () => {
	db.query("SELECT shared_address, peer_amount FROM contracts WHERE checked_timeout = 0 AND creation_date < " + db.addTime("-" + conf.contractTimeout + " hours"), (rows) => {
		if (!rows.length) return;
		let assocPerAmountsForSharedAddress = {};
		let arrRefundAddress = [];
		let arrNotRefundAddress = [];

		rows.forEach((row) => {
			assocPerAmountsForSharedAddress[row.shared_address] = row.peer_amount;
		});
		async.eachOf(assocPerAmountsForSharedAddress, (peer_amount, shared_address, callback) => {
			db.query("SELECT address, amount FROM outputs WHERE address = ? AND amount = ?", [shared_address, peer_amount], (rows) => {
				if (rows.length) {
					arrNotRefundAddress.push(shared_address);
				} else {
					arrRefundAddress.push(shared_address);
				}
				callback();
			});
		}, () => {
			if (arrNotRefundAddress.length)
				db.query("UPDATE contracts SET checked_timeout = 1, refunded = 0 WHERE shared_address IN (?)", [arrNotRefundAddress], () => {});

			if (!arrRefundAddress.length) return;
			headlessWallet.issueOrSelectNextMainAddress((myAddress) => {
				async.each(arrRefundAddress, (address, callback) => {
					headlessWallet.sendAllBytesFromSharedAddress(address, myAddress, null, (err) => {
						if (err) {
							console.error(new Error(err));
							arrRefundAddress.splice(arrRefundAddress.indexOf(address), 1);
						}
						callback();
					});
				}, () => {
					if (arrRefundAddress.length)
						db.query("UPDATE contracts SET checked_timeout = 1, refunded = 1 WHERE shared_address IN (?)", [arrRefundAddress], () => {});
				});
			});
		});
	});
};

exports.getListOfContactsForVerification = (cb) => {
	db.query("SELECT * FROM contracts WHERE checked_timeout = 1 AND refunded = 0 AND check_flight = 1 AND date < " + db.addTime('+2 days'), cb);
};

exports.getContractsByFeedName = (feed_name, cb) => {
	db.query("SELECT * FROM contracts WHERE feed_name=?", [feed_name], cb);
};

exports.setWinner = (feed_name, winner) => {
	db.query("UPDATE contracts SET check_flight = 0, winner = ? WHERE feed_name = ?", [winner, feed_name], () => {});
};

exports.getNotFinalUnlockedContracts = (cb) => {
	db.query("SELECT * FROM contracts WHERE checked_timeout = 1 AND check_flight = 0 AND unlocked = 0", cb)
};

exports.setUnlockedContract = (shared_address) => {
	db.query("UPDATE contracts SET unlocked = 1 WHERE shared_address = ?", [shared_address], () => {});
};