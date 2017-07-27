/*jslint node: true */
"use strict";

const constants = require('byteballcore/constants');

exports.port = null;
//exports.myUrl = 'wss://mydomain.com/bb';
exports.bServeAsHub = false;
exports.bLight = false;

exports.storage = 'sqlite';


exports.hub = 'byteball.org/bb';
exports.deviceName = 'Insurance';
exports.permanent_paring_secret = '0000';
exports.control_addresses = [];
exports.payout_address = 'WHERE THE MONEY CAN BE SENT TO';

exports.bIgnoreUnpairRequests = true;
exports.bSingleAddress = false;
exports.THRESHOLD_DISTANCE = 20;
exports.MIN_AVAILABLE_WITNESSINGS = 100;
exports.KEYS_FILENAME = 'keys.json';

//email
exports.useSmtp = false;


//contract
exports.oracle_address = 'HMW27QM7QTVRGAIIHUW7L2ZQ4N3TOJDU';
exports.oracle_pairing_code = 'ArHXmPo3WEm6OERICadr6qcTU67lcQ0YLiUntuZEesXi@byteball.org/bb-test#0000';
exports.TIMESTAMPER_ADDRESS = 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'; // isTestnet ? 'OPNUXBRSSQQGHKQNEPD2GLWQYEUY5XLD' : 'I2ADHGP4HL6J37NQAD73J7E5SKFIXJOT'


//flightstats API
exports.flightstats = {appId: '', appKey: ''};


//buttons
exports.delayTime = [
	{minutes: 30, text: '30 minutes'},
	{minutes: 60, text: '1 hour'},
	{minutes: 60 * 2, text: '2 hours'},
	{minutes: 60 * 4, text: '4 hours'}
];

//bot
exports.contractTimeout = 4; // hours
exports.contractExpiry = 1; //days

exports.defaultPriceInPercent = {
	gt0: 20,
	gt15: 30,
	gt30: 40,
	gt45: 50
};

exports.defaultAsset = 'base';
exports.defaultNameAsset = ''; // change if you want to give your name of asset
exports.unitValue = 1000000000; //GB
exports.minCompensation = 0.00001; //GB - 0.00001 - 10000 bytes
exports.maxCompensation = 100; //GB

exports.minDaysBeforeFlight = 1;
exports.maxMonthsBeforeFlight = 3;

exports.analysisOfRealTimeDelays = false;
exports.profitMargin = 5; //% if use analysisOfRealTimeDelays
exports.maxPriceInPercent = 90;

exports.nonInsurableFlights = ['BA0000'];
exports.nonInsurableAirlines = ['ZZ'];

exports.coefficientsForFlight = {SU0000: 1.2};
exports.coefficientsForAirline = {SU: 1.2};


if(!exports.defaultNameAsset) {
	if (exports.defaultAsset === 'base') exports.defaultNameAsset = 'GB';
	else exports.defaultNameAsset = exports.defaultAsset;
}