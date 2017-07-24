/*jslint node: true */
'use strict';

const db = require('byteballcore/db');
const device = require('byteballcore/device');
const headlessWallet = require('headless-byteball');
const async = require('async');
const conf = require('byteballcore/conf');

exports.checkAndRefundContractsTimeout = () => {
	db.query("SELECT int_value FROM data_feeds WHERE unit IN \n\
		(SELECT unit_authors.unit FROM unit_authors, units \n\
		WHERE address = ? AND units.unit = unit_authors.unit AND units.is_stable = 1 \n\
		ORDER BY unit_authors.rowid DESC LIMIT 0,1)", [conf.TIMESTAMPER_ADDRESS], (timestampRows) => {
		if(!timestampRows.length) return;
		db.query("SELECT shared_address, peer_amount FROM contracts WHERE checked_timeout = 0 AND timeout < ?", [timestampRows[0].int_value], (rows) => {
			if (!rows.length) return;
			let arrRefundAddresses = [];
			let arrNotRefundAddresses = [];

			async.each(rows, (row, callback) => {
				db.query("SELECT address, amount FROM outputs, units \n\
				WHERE address = ? AND amount = ? AND units.unit = outputs.unit AND is_stable = 1 AND sequence = 'good", [row.shared_address, row.peer_amount], (rows2) => {
					if (rows2.length) {
						arrNotRefundAddresses.push(row.shared_address);
					} else {
						arrRefundAddresses.push(row.shared_address);
					}
					callback();
				});
			}, () => {
				if (arrNotRefundAddresses.length)
					db.query("UPDATE contracts SET checked_timeout = 1, refunded = 0 WHERE shared_address IN (?)", [arrNotRefundAddresses], () => {});

				if (!arrRefundAddresses.length) return;
				headlessWallet.issueOrSelectNextMainAddress((myAddress) => {
					async.each(arrRefundAddresses, (address, callback) => {
						headlessWallet.sendAllBytesFromSharedAddress(address, myAddress, null, (err) => {
							if (err) {
								console.error(new Error(err));
								arrRefundAddresses.splice(arrRefundAddresses.indexOf(address), 1);
							}
							callback();
						});
					}, () => {
						if (arrRefundAddresses.length)
							db.query("UPDATE contracts SET checked_timeout = 1, refunded = 1 WHERE shared_address IN (?)", [arrRefundAddresses], () => {});
					});
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