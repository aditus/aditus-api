var config = require('./config.json');
let API_PATH = config['API_PATH'];
request = require('request-json');
var CryptoJS = require('crypto-js');
const secp256k1 = require('secp256k1');
var prompt = require('prompt');
console.log('Testing aditus api at '+API_PATH);
var client = request.createClient(API_PATH);

function stringifyProperly(o) {
    var cache = [];
    var text = JSON.stringify(o, function (key, value) {
        if (typeof value === 'object' && value !== null) {
            if (cache.indexOf(value) !== -1) {
                // Circular reference found, discard key
                return;
            }
            // Store value in our collection
            cache.push(value);
        }
        return value;
    });
    cache = null;
    return text;
}
function encrypt(data,privKey) {
    var encrypted = CryptoJS.AES.encrypt(data, privKey).toString();
    return encrypted;
}

function sign(data,privKey) {
    var json = false;
    if (typeof data === 'object' && data !== null) {
        var cache = [];
        data = stringifyProperly(data);
        json = true;
        cache = null;
    }
    var msgHash = Buffer.from(CryptoJS.SHA3(data, { outputLength: 256 }).toString(CryptoJS.enc.Hex), 'hex');
    var signObj = secp256k1.sign(msgHash, Buffer.from(privKey, 'hex'));
    var emSign = signObj.signature.toString('hex') + (signObj.recovery + 27);
    return emSign;
}
var EC = require('elliptic').ec; 
var ec = new EC('secp256k1');

function getAddress(privKey) {
    var keyPair = ec.genKeyPair();
    keyPair._importPrivate(privKey, 'hex');
    var compact = false;
    var pubKey = keyPair.getPublic(compact, 'hex').slice(2);
    var pubKeyWordArray = CryptoJS.enc.Hex.parse(pubKey);
    var hash = CryptoJS.SHA3(pubKeyWordArray, { outputLength: 256 });
    var address = hash.toString(CryptoJS.enc.Hex).slice(24);
    return (address ? '0x'+address : null);
}

var NodeRSA = require('node-rsa');
function encryptForPartner(data,key) {
    if (typeof data === 'object' && data !== null) {
        var cache = [];
        data = stringifyProperly(data);
        cache = null;
    }

    var key = new NodeRSA(key);
    var encrypted = key.encrypt(data, 'base64');
    return encrypted;
}
function testMethod(method,data,cb,checker) {
    console.log('Testing /api'+method);
    client.post('/api'+method, data, function(err, res, body) {
        var testPassed= false;
        if (!err) {
            if (res.statusCode == 200 || res.statusCode =='200') {
                if (body && body.success) {
                    testPassed = true;
                } else {
                    if (body && body.message) {
                        console.log('server message:'+body.message);
                    }
                }
            } else {
                console.log('status code:'+res.statusCode);
            }
        } else {
            console.log('err received:'+err);
        }
        if (testPassed) {
            if (checker) {
                if (checker(body)) {
                    console.log('passed');
                } else {
                    console.log('failed');
                }
            } else
                console.log('passed');
        } else {
            console.log('failed');
        }
        if (cb) cb(testPassed,body);
    });
}


function testSignedMethod(method,privateKey,data,cb,checker) {
    var requestData = {
        data: data,
        signature: sign(data,privateKey)
    }
    console.log('Testing /api'+method+' signed with '+privateKey);
    client.post('/api'+method, requestData, function(err, res, body) {
        var testPassed= false;
        if (!err) {
            if (res.statusCode == 200 || res.statusCode =='200') {
                if (body && body.success) {
                    testPassed = true;
                } else {
                    if (body && body.message) {
                        console.log('server message:'+body.message);
                    }
                }
            } else {
                console.log('status code:'+res.statusCode);
            }
        } else {
            console.log('err received:'+err);
        }
        if (testPassed) {
            if (checker) {
                if (checker(body)) {
                    console.log('passed');
                } else {
                    console.log('failed');
                }
            } else
                console.log('passed');
        } else {
            console.log('failed');
        }
        if (cb) cb(testPassed,body);
    });
}

function testCheckPhoneNumber(cb) {
    console.log('checkphonenumber end point');
    prompt.start();
    console.log('Enter existing phone number (e.g. +123456)');
    prompt.get(['phoneNumber'], function (err, result) {
        var data = {
            phoneNumber: result.phoneNumber
        };
        testMethod('/checkphonenumber',data,cb);
    });
}

function testRegister(cb) {
    console.log('register end point');
    prompt.start();
    console.log('Enter a phone number (e.g. +123213), the person to impersoante as (e.g. Charaka, Prabhu) and a wallet private key');
    prompt.get(['phoneNumber','impersonate','privateKey'], function (err, result) {
        var data = {
            phoneNumber: result.phoneNumber,
            impersonate: result.impersonate
        };
        var key = result.privateKey;
        var address = getAddress(key);
        var out = JSON.stringify(data);
        var encrypted = encrypt(out,address);
        testSignedMethod('/register',key,encrypted,cb);
    });
}

function testConfirm(cb) {
    console.log('confirm end point');
    prompt.start();
    console.log('Enter confirmation code and a wallet private key');
    prompt.get(['confirmationCode','privateKey'], function (err, result) {
        var data = {
            confirmationCode: result.confirmationCode
        };
        var key = result.privateKey;
        testSignedMethod('/confirm',key,data,cb);
    });
}


//updateDetails
function testUpdateDetails(cb) {
    console.log('updateDetails end point');
    prompt.start();
    console.log('Enter a text as details and a wallet private key');
    prompt.get(['details','privateKey'], function (err, result) {
        var data = {
            details: result.details
        };
        var key = result.privateKey;
        testSignedMethod('/updateDetails',key,data,cb);
    });
}

//fetchDetails
function testFetchDetails(cb) {
    console.log('fetchDetails end point');
    prompt.start();
    console.log('Enter a text as details and a wallet private key');
    prompt.get(['privateKey'], function (err, result) {
        var key = result.privateKey;
        testSignedMethod('/fetchDetails',key,'',cb,function(body) {
            if(body && body.details) {
                return true;
            } else {
                console.log('content is empty');
                return false;
            }
        });
    });
}

//updateScanContent
function testUpdateScanContent(cb) {
    console.log('updateScanContent end point');
    prompt.start();
    console.log('Enter a text as contents and a wallet private key');
    prompt.get(['contents','privateKey'], function (err, result) {
        var data = {
            contents: result.contents
        };
        var key = result.privateKey;
        testSignedMethod('/updateScanContent',key,data,cb);
    });
}

//rehydrate
function testRehydrate(cb) {
    console.log('rehydrate end point');
    prompt.start();
    console.log('Enter a wallet private key');
    prompt.get(['privateKey'], function (err, result) {
        var key = result.privateKey;
        testSignedMethod('/rehydrate',key,'',cb);
    });
}

function gethash(message) {
    return CryptoJS.SHA3(message, { outputLength: 256 }).toString(CryptoJS.enc.Hex);
}
//deals/:id/claim
function testDealClaim(cb) {
    console.log('deal claim end point');
    prompt.start();
    console.log('Enter a wallet private key');
    prompt.get(['privateKey'], function (err, result) {
        var key = result.privateKey;
        var dealId = 1;
        testSignedMethod('/deals/'+dealId,key,'',function(passed,body) {
            if (passed) {
                var publicKey = body.result.deal.publicKey;
                var response = 'test';
                var data = {
                    userResponseData: encrypt(response,key),
                    userResponseData: encryptForPartner(response,publicKey)
                };
                data.userResponseDataHash = gethash(data.userResponseData);
                data.partnerResponseDataHash = gethash(data.partnerResponseData);
                testSignedMethod('/deals/'+dealId+'/claim',key,data,cb);
            } else {
                cb(passed,body);
            }
        }, function(body) {
            if (body && body.result && body.result.deal && body.result.deal.publicKey) {
                return true;
            } else {
                console.log('unable to retrive deal public key')
                return false;
            }
        });
    });
}

//transactions
function testTransactions(cb) {
    var data = {
        wallet: '0x50E6474b500E4F5290D399ce81a0E704F8dbF943'
    };
    testMethod('/transactions',data,cb,function(body) {
        if (body && body.result && body.result.allTransactions && body.result.allTransactions.length>0
                && body.result.customTokens && body.result.customTokens.length>0) {
            return true;
        } else {
            console.log('transactions results are empty');
            return false;
        }
    });
}

//transactions/:hash
function testTransactionHash(cb) {
    var testHash = '0xdd88f68799f523479bb86fc809d7ccded727440f41c3a48ed0800655d7a64ee6';
    var data = {};
    testMethod('/transactions/'+testHash,data,cb);
}
//deals
function testDeals(cb) {
    var data = {};
    testMethod('/deals',data,cb);
}

//deals/:id
function testDealsId(cb) {
    var dealId = 1;
    var data = {};
    testMethod('/deals/'+dealId,data,cb);
}
//preferences
function testPreferences(cb) {
    var data = {};
    testMethod('/preferences',data,cb,function(body) {
        if (body && body.results && body.results.length>0) {
            return true;
        } else {
            console.log('preferences are empty');
            return false;
        }
    });
}

//setPreferences
function testSetPreferences(cb) {
    var data = {
        notificationId: '123',
        preferences: ['villas','cars']
    };
    testMethod('/setPreferences',data,cb);
}

//changeNotificationId
function testChangeNotificationId(cb) {
    var data = {
        oldNotificationId: '123',
        newNotificationId: '456'
    };
    testMethod('/changeNotificationId',data,function(passed,body) {
        data = {
            oldNotificationId: '456',
            newNotificationId: '123'
        }
        if (passed) {
            testMethod('/changeNotificationId',data,cb);
        } else {
            cb(passed,body);
        }
    });
}


//sliders
function testSliders(cb) {
    var data = {};
    testMethod('/sliders',data,cb,function(body) {
        if (body && body.results && body.results.length>0) {
            return true;
        } else {
            console.log('sliders are empty');
            return false;
        }
    });
}
//dealprefs
function testDealprefs(cb) {
    var data = {};
    testMethod('/dealprefs',data,cb,function(body) {
        if (body && body.results && body.results.length>0) {
            return true;
        } else {
            console.log('dealprefs are empty');
            return false;
        }
    });
}

testTransactions(function() {
testTransactionHash(function() {
testDeals(function() {
testPreferences(function() {
testSetPreferences(function() {
testChangeNotificationId(function() { 
testDealsId(function() {
testSliders(function() {
testDealprefs(function() {
testCheckPhoneNumber(function() {
console.log('requires a private key for other tests e.g. (cc6d9f68089b1d7ab9b6a944555ec16193844c4ab4dc67f7720785113e44ad5a)');
testRegister(function() {
testConfirm(function() {
testUpdateDetails(function() {
testFetchDetails(function() {
testUpdateScanContent(function() {
testRehydrate(function() {
testDealClaim(function() {
});
});
});
});
});
});
});
});
});
});
});
});
});
});
});
});
});