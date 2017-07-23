/*jslint node: true */
'use strict';
const conf = require('byteballcore/conf');
const db = require('byteballcore/db');
const eventBus = require('byteballcore/event_bus');
const headlessWallet = require('headless-byteball');
const texts = require('./texts');
const states = require('./states');
const moment = require('moment');
const priceCalculation = require('./priceCalculation');
const offerFlightDelaysContract = require('./offerFlightDelaysContract');
const validationUtils = require('byteballcore/validation_utils');
const notifications = require('./notifications');
const correspondents = require('./correspondents');
const contract = require('./contract');
const wallet = require('byteballcore/wallet');
const async = require('async');

let my_address;
let oracle_device_address;

let arrWaitingStableUnits = [];

headlessWallet.setupChatEventHandlers();

function sendRequestsToOracle(rows) {
	let device = require('byteballcore/device');
	if (!rows.length) return;

	rows.forEach((row) => {
		let name = row.feed_name.split('-')[0] + ' ' + moment(row.date).format("DD.MM.YYYY");
		device.sendMessageToDevice(oracle_device_address, 'text', name);
	});
	setTimeout(checkStatusOfContracts, 1000 * 60, rows);
}

function refundBytes(contractRow) {
	headlessWallet.issueOrSelectNextMainAddress((myAddress) => {
		headlessWallet.sendAllBytesFromSharedAddress(contractRow.peer_asset, contractRow.shared_address, myAddress, null, (err) => {
			if (err) return console.error(new Error(err));
			contract.setUnlockedContract(contractRow.shared_address);
		});
	});
}

function payToPeer(contractRow) {
	let device = require('byteballcore/device');
	if (contractRow.peer_asset) {
		headlessWallet.sendAllAssetFromSharedAddress(contractRow.peer_asset, null, contractRow.shared_address, contractRow.peer_address, contractRow.peer_device_address, (err) => {
			if (err) return console.error(new Error(err));
			contract.setUnlockedContract(contractRow.shared_address);
			device.sendMessageToDevice(contractRow.peer_device_address, 'text', texts.weSentPayment());
		});
	} else {
		device.sendMessageToDevice(contractRow.peer_device_address, 'text', texts.contractStable());
		contract.setUnlockedContract(contractRow.shared_address);
	}
}

function checkStatusOfContracts(rows) {
	let device = require('byteballcore/device');
	let arrFeedNames = rows.map(row => row.feed_name);
	let assocContractsToFeedName = {};
	rows.forEach((row) => {
		if (!assocContractsToFeedName[row.feed_name]) assocContractsToFeedName[row.feed_name] = [];
		assocContractsToFeedName[row.feed_name].push(row);
	});
	db.query("SELECT data_feeds.feed_name, data_feeds.int_value, units.unit, units.is_stable\n\
	FROM data_feeds, units, unit_authors\n\
	WHERE data_feeds.feed_name IN(?)\n\
	AND units.unit = data_feeds.unit\n\
	AND unit_authors.unit = data_feeds.unit\n\
	AND unit_authors.address = ?", [arrFeedNames, conf.oracle_address], (rows2) => {
		rows2.forEach((row) => {
			if (assocContractsToFeedName[row.feed_name]) {
				assocContractsToFeedName[row.feed_name].forEach((contractRow) => {
					if (row.int_value > contractRow.delay) {
						if (row.is_stable) {
							payToPeer(contractRow);
						} else {
							if (arrWaitingStableUnits.indexOf(row.unit) === -1) arrWaitingStableUnits.push(row.unit);
						}
						contract.setWinner(contractRow.feed_name, 'peer');
					} else {
						device.sendMessageToDevice(contractRow.peer_device_address, 'text', texts.arriveOnTime());
						if (row.is_stable) {
							refundBytes(contractRow);
						} else {
							if (arrWaitingStableUnits.indexOf(row.unit) === -1) arrWaitingStableUnits.push(row.unit);
						}
						contract.setWinner(contractRow.feed_name, 'me');
					}
				});
			}
		});
	});
}

eventBus.on('mci_became_stable', (mci) => {
	let device = require('byteballcore/device');
	db.query("SELECT unit FROM units WHERE main_chain_index = ?", [mci], (rows) => {
		rows.forEach((row) => {
			if (arrWaitingStableUnits[row.unit]) {
				contract.getContractsByFeedName(arrWaitingStableUnits[row.unit], (rowsContracts) => {
					rowsContracts.forEach((contractRow) => {
						if (contractRow.winner) {
							if (contractRow.winner === 'me') {
								refundBytes(contractRow);
							} else if (contractRow.winner === 'peer') {
								payToPeer(contractRow);
							}
						}
					});
				});
			}
		});
	});
});


eventBus.on('paired', (from_address) => {
	let device = require('byteballcore/device.js');
	device.sendMessageToDevice(from_address, 'text', texts.flight());
});

function getHelpText(command) {
	switch (command) {
		case 'flight':
			return texts.flight();
			break;
		case 'delay':
			return texts.delay();
			break;
		case 'compensation':
			return texts.compensation();
			break;
	}

	return false;
}

eventBus.on('text', (from_address, text) => {
	if (from_address === oracle_device_address) return;

	states.get(from_address, (state) => {
		let device = require('byteballcore/device.js');
		let lcText = text.toLowerCase().trim().replace(/\s+/, ' ');
		let validTime = false;

		if (getHelpText(lcText)) return device.sendMessageToDevice(from_address, 'text', getHelpText(lcText));

		if (moment(state.date).add(3, 'days') < moment()) {
			state.flight = null;
			state.delay = null;
			state.compensation = null;
		}

		if (validationUtils.isValidAddress(lcText.toUpperCase()) && state.price && state.compensation && state.flight && state.delay) {
			let minDaysBeforeFlight = moment().set("hours", 0).set("minutes", 0).set("seconds", 0).set('milliseconds', 0).add(conf.minDaysBeforeFlight, 'days').valueOf();
			if (moment(state.flight.split(' ')[1], "DD.MM.YYYY").valueOf() >= minDaysBeforeFlight) {
				return getLastAddress((myAddress) => {
					offerFlightDelaysContract(myAddress, moment(state.flight.split(' ')[1], "DD.MM.YYYY"), {
						peerAddress: lcText.toUpperCase(),
						peerDeviceAddress: from_address,
						peerAmount: state.price,
						myAmount: state.compensation,
						asset: 'base',
						feed_name: state.flight.toUpperCase(),
						relation: '>',
						feedValue: state.delay,
						expiry: 1, //days
						timeout: 4 //hours
					}, function (err, paymentRequestText) {
						if (err) {
							console.error(new Error('offerContract error: ' + JSON.stringify(err)));
							notifications.notifyAdmin('offerContract error', JSON.stringify(err));
							return device.sendMessageToDevice(from_address, 'text', texts.errorOfferContract());
						}
						state.flight = null;
						state.delay = null;
						state.compensation = null;
						state.save();
						return device.sendMessageToDevice(from_address, 'text', paymentRequestText);
					});
				});
			} else {
				state.flight = null;
				state.save();
				return device.sendMessageToDevice(from_address, 'text', texts.errorValidDate());
			}
		}

		if (/\b[a-z0-9]{2}\d{1,4}([a-z]?)\s\d{1,2}\.\d{2}\.\d{4}\b/.test(lcText)) {
			let flight = lcText.match(/\b[a-z0-9]{2}\d{1,4}([a-z]?)\s\d{1,2}\.\d{2}\.\d{4}\b/)[0];
			let arrFlightMatches = flight.toUpperCase().split(' ')[0].match(/\b([A-Z0-9]{2})\s*(\d{1,4}[A-Z]?)\b/);

			if (flight && moment(flight.split(' ')[1], "DD.MM.YYYY").isValid()) {
				let minDaysBeforeFlight = moment().set("hours", 0).set("minutes", 0).set("seconds", 0).set('milliseconds', 0).add(conf.minDaysBeforeFlight, 'days').valueOf();
				if (moment(flight.split(' ')[1], "DD.MM.YYYY").valueOf() >= minDaysBeforeFlight) {
					if (conf.nonInsurableAirlines.indexOf(arrFlightMatches[1]) === -1 && conf.nonInsurableFlights.indexOf(flight.split(' ')[0].toUpperCase()) === -1) {
						lcText = lcText.replace(flight, '').trim();
						state.flight = flight;
					} else {
						return device.sendMessageToDevice(from_address, 'text', texts.errorNonInsurable());
					}
				} else {
					return device.sendMessageToDevice(from_address, 'text', texts.errorMinDaysBeforeFlight(conf.minDaysBeforeFlight));
				}
			} else {
				return device.sendMessageToDevice(from_address, 'text', texts.errorValidDate());
			}
		}

		if (/[0-9]+\s(minutes|minute|hours|hour)/.test(lcText)) {
			let arrTime = lcText.match(/[0-9]+\s(minutes|minute|hours|hour)/)[0].split(' ');
			lcText = lcText.replace(lcText.match(/[0-9]+\s(minutes|minute|hours|hour)/)[0], '').trim();

			let minutes;
			if (arrTime[1] === 'minutes' || arrTime[1] === 'minute') {
				minutes = parseInt(arrTime[0]);
			} else {
				minutes = parseInt(arrTime[0]) * 60;
			}

			for (let i = 0, l = conf.delayTime.length; i < l; i++) {
				if (conf.delayTime[i].minutes === minutes) {
					validTime = true;
					break;
				}
			}

			if (!validTime) return device.sendMessageToDevice(from_address, 'text', texts.delay());
			state.delay = minutes;
		}

		if (/[0-9]+,[0-9]+/.test(lcText)) lcText = lcText.replace(',', '.');
		if (/[0-9]+(\.[0-9]+)?/.test(lcText)) {
			let compensation = parseFloat(lcText.match(/[0-9]+(\.[0-9]+)?/)[0]);
			if (compensation > conf.maxCompensation) {
				return device.sendMessageToDevice(from_address, 'text', texts.errorMaxCompensation());
			} else if (compensation < conf.minCompensation) {
				return device.sendMessageToDevice(from_address, 'text', texts.errorMinCompensation());
			}
			state.compensation = compensation;
		}

		state.save();

		if (!state.flight) return device.sendMessageToDevice(from_address, 'text', texts.flight());
		if (!state.delay) return device.sendMessageToDevice(from_address, 'text', texts.delay());
		if (!state.compensation) return device.sendMessageToDevice(from_address, 'text', texts.compensation());

		if (lcText === 'ok') {
			return device.sendMessageToDevice(from_address, 'text', texts.insertMyAddress());
		} else if (lcText === 'edit') {
			return device.sendMessageToDevice(from_address, 'text', texts.edit());
		}

		priceCalculation(state, (err, price) => {
			if (err) return device.sendMessageToDevice(from_address, 'text', err);
			state.price = price;
			state.save();
			return device.sendMessageToDevice(from_address, 'text', texts.total(state.flight, state.delay, state.compensation, price));
		});
	});
});

function getLastAddress(cb) {
	headlessWallet.readSingleWallet((wallet) => {
		db.query("SELECT address FROM my_addresses WHERE wallet=? ORDER BY creation_date DESC LIMIT 0, 1", [wallet], (rows) => {
			cb(rows[0].address);
		});
	});
}

function getListContractsAndSendRequest() {
	contract.getListOfContactsForVerification((rows) => {
		sendRequestsToOracle(rows);
	});
}

function getListNotFinalRefundedContracts() {
	contract.getNotFinalUnlockedContracts((rows) => {
		rows.forEach((contractRow) => {
			if (contractRow.winner) {
				if (contractRow.winner === 'me') {
					refundBytes(contractRow);
				} else if (contractRow.winner === 'peer') {
					payToPeer(contractRow);
				}
			}
		});
	});
}

eventBus.on('headless_wallet_ready', () => {
	let error = '';
	let arrDbName = ['flightstats_ratings', 'states', 'contracts'];
	db.query("SELECT name FROM sqlite_master WHERE type='table' AND name IN (?)", [arrDbName], (rows) => {
			if (rows.length !== arrDbName.length) error += texts.errorInitSql();

			if (conf.useSmtp && (!conf.smtpUser || !conf.smtpPassword || !conf.smtpHost)) error += texts.errorSmtp();

			if (!conf.admin_email || !conf.from_email) error += texts.errorEmail();

			if (conf.analysisOfRealTimeDelays && (!conf.flightstats.appId || !conf.flightstats.appKey || !conf.profitMargin)) error += texts.errorFlightstats();

			if (error) {
				console.error(new Error(error));
				process.exit(1);
			}

			getLastAddress((address) => {
				my_address = address;

				setInterval(contract.checkAndRefundContractsTimeout, 3600 * 1000);
				contract.checkAndRefundContractsTimeout();
			});

			correspondents.findCorrespondentByPairingCode(conf.oracle_pairing_code, (correspondent) => {
				if (!correspondent) {
					correspondents.addCorrespondent(conf.oracle_pairing_code, 'flight oracle', (err, device_address) => {
						if (err) {
							console.error(new Error(error));
							process.exit(1);
						}
						oracle_device_address = device_address;
						getListContractsAndSendRequest();
					});
				} else {
					oracle_device_address = correspondent.device_address;
					getListContractsAndSendRequest();
				}
			});

			setInterval(getListContractsAndSendRequest, 6 * 3600 * 1000);

			getListNotFinalRefundedContracts();
			setInterval(getListNotFinalRefundedContracts, 6 * 3600 * 1000);
		}
	);
});