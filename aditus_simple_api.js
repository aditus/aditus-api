var express = require('express');
var cors = require('cors');
var app = express();
app.use(express.static('public'))
app.use(cors());
var bodyParser = require('body-parser');
var CryptoJS = require('crypto-js');
const secp256k1 = require('secp256k1');
const rlp = require('rlp');
var NodeRSA = require('node-rsa');

const aditus_dbservice = require('./aditus_dbservice.js');
const aditus_utils = require('./common/aditus_utils.js');
const aditus_queuer = require('./common/aditus_queuer.js');
const attachAditusDocumentation = require('./aditus_documentation.js');
var config = require('./aditus_config.json');
var testEnabled = config["TEST"] ? true : false;
const service = aditus_dbservice(config);
const utils = aditus_utils(config);
const rehydrator = aditus_queuer(config,config["REHYDRATOR_QUEUE_NAME"]);
const tokenVendar = aditus_queuer(config,config["TOKEN_VENDAR_QUEUE_NAME"]);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 80;

var router = express.Router();

attachAditusDocumentation(router);

rehydrator.register(function(msg){
    console.log('REHYDRATOR: '+ JSON.stringify(msg));
})
tokenVendar.register(function(msg){
    console.log('TOKEN VENDAR: '+JSON.stringify(msg));
})
//test PrvKey = cc6d9f68089b1d7ab9b6a944555ec16193844c4ab4dc67f7720785113e44ad5a
//test PubKey = d39a737f9e39fa796dd91b0c9ed522cf52535f9549766f73e6acbcd7e9ae66b6ce19fc23f3e4a111fb9be51e1831b81b8d3b156d27affdd6446d5bfcbfa0547a
//test Wallet = a18d4a618ee96f6cd126362029c5feef6935d60d
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
function gethash(message) {
    return CryptoJS.SHA3(message, { outputLength: 256 }).toString(CryptoJS.enc.Hex);
}


router.post('/dev/hash', function (req, res) {
    var message = req.body.data;
    if (typeof message !== "string") {
        return res.json({
            success: false,
            message: "data should be a string"
        });
    }
    var msgHash = gethash(message);
    res.json({
        data: message,
        hash: msgHash
    });
});

router.post('/dev/sign', function (req, res) {
    try {
        var privKey = req.body.privKey;
        var data = req.body.data;
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
        var encoded = rlp.encode(stringifyProperly({ data: data, signature: emSign })).toString('hex');
        res.json({
            data: data,
            signature: emSign,
            encoded: encoded
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/dev/wallets', function (req, res) {
    try {
        service.getTestWallets(function (wallets) {
            res.json({
                success: true,
                wallets: wallets
            });
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/dev/encrypt', function (req, res) {
    var privKey = req.body.userKey;
    var data = req.body.data;
    if (typeof data === 'object' && data !== null) {
        var cache = [];
        data = stringifyProperly(data);
        cache = null;
    }
    var encrypted = CryptoJS.AES.encrypt(data, privKey).toString();
    res.json({
        data: data,
        encrypted: encrypted
    });
});

router.post('/dev/encryptforpartner', function (req, res) {
    var privKey = req.body.pubKey;
    var data = req.body.data;
    if (typeof data === 'object' && data !== null) {
        var cache = [];
        data = stringifyProperly(data);
        cache = null;
    }

    var key = new NodeRSA(privKey);
    if (!key.isPublic()) {
        return res.status(500).json({ success: false, message: "no public key provided" });
    }
    var encrypted = key.encrypt(data, 'base64');
    res.json({
        data: data,
        encrypted: encrypted
    });
});

router.post('/dev/decrypt', function (req, res) {
    var privKey = req.body.userKey;
    var encrypted = req.body.encrypted;
    var bytes = CryptoJS.AES.decrypt(encrypted, privKey);
    var data = bytes.toString(CryptoJS.enc.Utf8);
    try {
        data = JSON.parse(data);
    } catch (err) { }
    res.json({
        data: data
    });
});

router.post('/dev/decryptforpartner', function (req, res) {
    var privKey = req.body.privKey;
    var encrypted = req.body.encrypted;

    var key = new NodeRSA(privKey);
    if (!key.isPrivate()) {
        return res.status(500).json({ success: false, message: "no private key provided" });
    }
    var data = key.decrypt(encrypted, 'utf8');
    try {
        data = JSON.parse(data);
    } catch (err) { }
    res.json({
        data: data
    });
});

router.post('/dev/add100eth', function (req, res) {
    var walletAddress = req.body.walletAddress;
    try {
        var transferAmount = 100;
        utils.transferEth(walletAddress,transferAmount,config["COINBASE_PRIVATE_KEY"],function(e,hash) {
            if (!e) {
                return res.json({
                    success: true,
                    hash: hash
                });
            } else {
                console.log(e);
                return res.status(500).json({
                    success: false,
                    message: "unable to process request"
                });
            }
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/dev/add100tsp', function (req, res) {
    var walletAddress = req.body.walletAddress;
    try {
        var transferAmount = 100;
        utils.transferTsp(walletAddress,transferAmount,config["COINBASE_PRIVATE_KEY"],function(e,hash) {
            if (!e) {
                return res.json({
                    success: true,
                    hash: hash
                });
            } else {
                console.log(e);
                return res.status(500).json({
                    success: false,
                    message: "unable to process request"
                });
            }
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/dev/impersonatelist',function (req, res) {
    try {
        service.getImpersonateList(function (results) {
            return res.json({
                success: (results) ? true : false,
                results: results
            });
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/checkphonenumber', function (req, res) {
    var phoneNumber = req.body.phoneNumber;
    try {
        service.isPhoneNumberInUse(phoneNumber, function (isInUse) {
            if (isInUse) {
                return res.json({
                    success: true,
                    message: "yes, phone number is in use"
                });
            } else {
                return res.json({
                    success: false,
                    message: "no, phone number is not in use"
                });
            }
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.use(function (req, res, next) {
    var signature = req.body.signature || '';
    var data = req.body.data || '';
    var encoded = req.body.encoded;
    try {
        var json = true;
        if (encoded) {
            var encodedData = Buffer.from(encoded, 'hex');
            var decodedData = rlp.decode(encodedData);
            var obj = JSON.parse(decodedData.toString());
            data = obj.data;
            signature = obj.signature;
            //json = obj.json;
        }
        if (typeof data === "object") {
            data = stringifyProperly(data);
        }
        var msgHash = Buffer.from(CryptoJS.SHA3(data, { outputLength: 256 }).toString(CryptoJS.enc.Hex), 'hex');
        r = signature.substr(0, 64);
        s = signature.substr(64, 64);
        v = signature.substr(128, 2);
        var recovery = v - 27;
        signature = Buffer.from('' + r + s, 'hex');
        var senderPubKey = secp256k1.recover(msgHash, signature, recovery);
        var convertedPubKey = secp256k1.publicKeyConvert(senderPubKey, false).slice(1);
        var pubKeyWordArray = CryptoJS.enc.Hex.parse(convertedPubKey.toString('hex'));
        var hash = CryptoJS.SHA3(pubKeyWordArray, { outputLength: 256 });
        var address = hash.toString(CryptoJS.enc.Hex).slice(24);

        var walletAddress = '0x' + address;
        var decodedWithWalletAddress = false;
        try {
            var bytes = CryptoJS.AES.decrypt(data, walletAddress);
            var decrypted = bytes.toString(CryptoJS.enc.Utf8);
            
            if (decrypted && decrypted.length>0) {
                data = decrypted;
                decodedWithWalletAddress = true;
            }
        } catch (err) { }

        req.requestData = data;
        try {
            if (json && typeof data === "string")
                data = JSON.parse(data);
        } catch (err) { }
        req.body = data;
        req.walletAddress = walletAddress;
        req.decodedWithWalletAddress = decodedWithWalletAddress;
        service.isWalletAlreadyRegistered(walletAddress, function (isRegistered) {
            console.log(isRegistered);
            if (isRegistered) {
                req.isAditus = true;
                rehydrator.push(walletAddress);
            }

            next();
        });
    } catch (err) {
        next();
    }
});
//API BEGINS

router.post('/', function (req, res) {
    var walletAddress = req.walletAddress;
    var isAditus = req.isAditus;
    if (!walletAddress)
        return res.status(403).json({ success: false, message: "unauthorized request" });

    return res.json({ message: 'aditus simple api', received: { walletAddress: req.walletAddress, data: req.body, aditus: isAditus } });
});

router.post('/register', function (req, res) {
    var walletAddress = req.walletAddress;
    var decodedWithWalletAddress = req.decodedWithWalletAddress;
    if (!walletAddress || !req.requestData || req.requestData.length<1)
        return res.status(403).json({ success: false, message: "unauthorized request" });

    if (!decodedWithWalletAddress)
        return res.status(403).json({ success: false, message: "request data should be encrypted with signed wallet address" });

    var phoneNumber = req.body.phoneNumber;
    var impersonate = req.body.impersonate;
    try {
        service.isWalletAlreadyRegistered(walletAddress, function (isRegistered) {
            if (isRegistered) {
                return res.json({
                    success: false,
                    message: "wallet is already registered"
                });
            } else {
                if (!phoneNumber) {
                    return res.json({
                        success: false,
                        message: "no phone number provided"
                    });
                }

                service.isPhoneNumberInUse(phoneNumber, function (isInUse) {
                    if (isInUse) {
                        return res.json({
                            success: false,
                            message: "phone number is in use"
                        });
                    } else {
                        function callRegister(impersonateNumber) {
                            service.registerWallet(walletAddress, phoneNumber, function (succeful, message) {
                                if (succeful) {
                                    res.json({
                                        success: true,
                                        message: message ? message : "sms sent"
                                    });
                                } else {
                                    res.json({
                                        success: false,
                                        message: message ? message : "unable to register"
                                    });
                                }
                            },impersonateNumber);
                        }
                        if (impersonate) {
                            service.getImpersonateNumber(impersonate,function(res) {
                                if (res) {
                                    callRegister(res);
                                } else {
                                    res.json({
                                        success: false,
                                        message: 'impersonator not found in the db'
                                    });
                                }
                            })
                        } else {
                            callRegister(null);
                        }
                        
                    }
                })
            }
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/confirm', function (req, res) {
    var walletAddress = req.walletAddress;
    var decodedWithWalletAddress = req.decodedWithWalletAddress;
    if (!walletAddress || !req.requestData || req.requestData.length<1)
        return res.status(403).json({ success: false, message: "unauthorized request" });

    var confirmationCode = req.body.confirmationCode;
    try {
        service.isWalletAlreadyRegistered(walletAddress, function (isRegistered) {
            if (isRegistered) {
                return res.json({
                    success: false,
                    message: "wallet is already registered"
                });
            } else {
                if (!confirmationCode) {
                    return res.json({
                        success: false,
                        message: "no confirmation code provided"
                    });
                }

                service.confirmPhoneNumber(walletAddress, confirmationCode,function (success,message) {
                    if (success) {
                        return res.json({
                            success: true,
                            message: message ? message : 'phone number confirmed'
                        });
                    } else {
                        return res.json({
                            success: false,
                            message: message ? message : 'unable to confirm phone number'
                        });
                    }
                })
            }
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.use(function (req, res, next) {
    var walletAddress = req.walletAddress;
    var isAditus = req.isAditus;
    if (!isAditus)
        req.walletAddress = null;

    next();
});

router.post('/transactions', function (req, res) {
    var walletAddress = req.walletAddress;
    if (req.body.wallet)
        walletAddress = req.body.wallet;

    var skip = req.body.skip;

    if (!walletAddress) {
        return res.json({
            success: false,
            message: "no wallet address provided"
        });
    }

    var test = testEnabled && req.body.test;
    try {
        service.getTransactionsByWalletAddress(walletAddress, test, skip, function (transactions) {
            service.getCustomTokensByWalletAddress(walletAddress, test, skip, function (tokens) {
                res.json({
                    success: true,
                    result: {
                        allTransactions: transactions,
                        customTokens: tokens
                    }
                });
            })
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});
router.post('/transactions/:hash', function (req, res) {
    var hash = req.params.hash;
    var test = testEnabled && req.body.test;
    try {
        service.getTransaction(hash, test, function (transaction) {
            if (!transaction) {
                res.json({
                    success: false,
                    message: "transaction does not exist"
                });
            } else {
                res.json({
                    success: true,
                    result: transaction
                });
            }
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/deals', function (req, res) {
    var walletAddress = req.walletAddress;
    var newOnly = req.body.newOnly;
    var preferences = req.body.preferences;
    var skip = req.body.skip;
    try {
        if (!walletAddress) {
            service.getAllDeals(preferences,skip,function (deals) {
                res.json({
                    success: true,
                    results: deals
                });
            })
        } else {
            service.getDealsForWallet(walletAddress, newOnly, preferences,skip,function (deals) {
                res.json({
                    success: true,
                    results: deals
                });
            })
        }
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/preferences', function (req, res) {
    var skip = req.body.skip;
    try {
        service.getAllPreferences(skip,function (preferences) {
            res.json({
                success: true,
                results: preferences
            });
        })
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});


router.post('/setPreferences', function (req, res) {
    var notificationId = req.body.notificationId;
    var preferences = req.body.preferences;
    try {
        service.setPreferencesForNotificationId(notificationId,preferences,function (succeful, message) {
            if (succeful) {
                res.json({
                    success: true,
                    message: "preferences has been set succefully"
                });
            } else {
                var message = result;
                res.json({
                    success: false,
                    message: (message) ? message : "unable to set preferences"
                });
            }
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/changeNotificationId', function (req, res) {
    var oldNotificationId = req.body.oldNotificationId;
    var newNotificationId = req.body.newNotificationId;
    try {
        service.changeNotificationId(oldNotificationId,newNotificationId,function (succeful, result) {
            if (succeful) {
                res.json({
                    success: true,
                    message: "notification id has been changed"
                });
            } else {
                var message = result;
                res.json({
                    success: false,
                    message: (message) ? message : "unable to change notification id"
                });
            }
        });
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/deals/:id', function (req, res) {
    var id = req.params.id;
    var walletAddress = req.walletAddress;
    try {
        service.getDeal(id, function (deal) {
            if (!deal) {
                res.json({
                    success: false,
                    message: "deal does not exist"
                });
            } else {
                if (!walletAddress) {
                    return res.json({
                        success: true,
                        result: {
                            deal: deal
                        }
                    });
                }
                service.getDealClaimForWallet(id, walletAddress, function (claim) {
                    if (claim) {
                        res.json({
                            success: true,
                            result: {
                                deal: deal,
                                claimed: true,
                                claim: claim
                            }
                        });
                    } else {
                        res.json({
                            success: true,
                            result: {
                                deal: deal,
                                claimed: false
                            }
                        });
                    }
                });
            }
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/sliders', function (req, res) {
    try {
        service.fetchSlider(function (success,out) {
            if (success) {
                res.json({
                    success: true,
                    results: out
                });
            } else {
                res.json({
                    success: false,
                    message: (out) ? out : 'unable to fetch sliders'
                });
            }
        })
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/dealprefs', function (req, res) {
    try {
        service.fetchDealPrefs(function (success,out) {
            if (success) {
                res.json({
                    success: true,
                    results: out
                });
            } else {
                res.json({
                    success: false,
                    message: (out) ? out : 'unable to fetch prefs'
                });
            }
        });
        // res.json({
        //     success: true,
        //     results: ['Watches', 'Villas', 'Wines', 'Travel']
        // });
    } catch (err) {
        console.log(err);
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.use(function (req, res, next) {
    var walletAddress = req.walletAddress;
    if (!walletAddress)
        return res.status(403).json({ success: false, message: "unauthorized request" });

    try {
        service.isWalletAlreadyRegistered(walletAddress, function (isRegistered) {
            if (isRegistered) {
                next();
            } else {
                return res.status(403).json({ success: false, message: "unauthorized request" });
            }
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});

router.post('/rehydrate', function (req, res) {
    //var walletAddress = req.walletAddress;
    //rehydrator.push(walletAddress);
    //no need to call as it's called already
    if (req.isAditus)
        res.json({
            success: true,
            message: "rehydrator queued"
        });
    else
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
});

router.post('/deals/:id/claim', function (req, res) {
    var id = req.params.id;
    var walletAddress = req.walletAddress;
    var userResponseData = req.body.userResponseData;
    var userResponseDataHash = req.body.userResponseDataHash;
    if (gethash(userResponseData) != userResponseDataHash) {
        return res.json({
            success: false,
            message: "invalid hash for user response data"
        });
    }
    var partnerResponseData = req.body.partnerResponseData;
    var partnerResponseDataHash = req.body.partnerResponseDataHash;
    if (gethash(partnerResponseData) != partnerResponseDataHash) {
        return res.json({
            success: false,
            message: "invalid hash for partner response data"
        });
    }
    try {
        service.getDeal(id, function (deal) {
            if (!deal) {
                res.json({
                    success: false,
                    message: "deal does not exist"
                });
            } else {
                service.getDealClaimForWallet(id, walletAddress, function (claim) {
                    if (claim) {
                        return res.json({
                            success: false,
                            message: "the deal is already claimed by the wallet"
                        });
                    } else {
                        service.claimDeal(id, walletAddress, userResponseData, partnerResponseData, function (succeful, result) {
                            if (succeful) {
                                var claimId = result;
                                tokenVendar.push(claimId);
                                res.json({
                                    success: true,
                                    message: "claimed succefully"
                                });
                            } else {
                                var message = result;
                                res.json({
                                    success: false,
                                    message: (message) ? message : "unable to claim"
                                });
                            }
                        });
                    }
                });
            }
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});
router.post('/updateDetails', function (req, res) {
    var walletAddress = req.walletAddress;
    var details = req.body.details;
    try {
        service.updateDetails(walletAddress, details, function (succeful) {
            if (succeful) {
                res.json({
                    success: true,
                    message: "updated succefully"
                });
            } else {
                res.json({
                    success: false,
                    message: "unable to claim"
                });
            }
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});
router.post('/fetchDetails', function (req, res) {
    var walletAddress = req.walletAddress;
    try {
        service.fetchDetails(walletAddress, function (details) {
            res.json({
                success: true,
                details: details
            });
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});
router.post('/updateScanContent', function (req, res) {
    var walletAddress = req.walletAddress;
    var contents = req.body.contents;
    try {
        service.updateScanContent(walletAddress, contents, function (succeful) {
            if (succeful) {
                res.json({
                    success: true,
                    message: "updated succefully"
                });
            } else {
                res.json({
                    success: false,
                    message: "update failed"
                });
            }
        })
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "unable to process request"
        });
    }
});
//API ENDS

app.use('/api', router);

app.listen(port);
console.log('ADITUS API on port ' + port);
