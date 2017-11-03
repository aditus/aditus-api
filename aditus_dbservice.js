const aditus_pgconnect = require('./common/aditus_pgconnect.js');
const image_host = 'http://adt.aditus.net';
var CryptoJS = require('crypto-js');
var twilio = require('twilio');

function gethash(message) {
    return CryptoJS.SHA3(message, { outputLength: 256 }).toString(CryptoJS.enc.Hex);
}

function service(config) {
    const CONST_CONNECTION_STR = config["CONNECTION_STRING"];
    if (!CONST_CONNECTION_STR)
        throw new Error('no connection string in aditus configuration');

    var CONST_TOKEN_ADDRESS = config["TSP_CONTRACT_TOKEN"];
    var CONST_TRANSFER_METHOD_SIGNATURE = "transfer(address,uint256)";
    var CONST_TRANSFER_METHOD_SIGNATURE_HASH = '0x' + gethash(CONST_TRANSFER_METHOD_SIGNATURE);
    var CONST_TRANSFER_METHOD_DATA_LENGTH = 138; //(10 + 64 + 64);

    var CONST_TRANSFER_EVENT_SIGNATURE = "Transfer(address,address,uint256)";
    var CONST_TRANSFER_EVENT_SIGNATURE_HASH = '0x' + gethash(CONST_TRANSFER_EVENT_SIGNATURE);

    const pgconnect = aditus_pgconnect(CONST_CONNECTION_STR);
    const query_db = pgconnect.query_db;
    const update_db = pgconnect.update_db;
    const Web3 = require('web3');
    const CONST_ETH_NODE_URL = config["ETH_NODE"];
    var web3 = new Web3(new Web3.providers.HttpProvider(CONST_ETH_NODE_URL));

    var twilioAccountSid = config.Twilio["ACCOUNT_SID"];
    var twilioAuthToken = config.Twilio["AUTH_TOKEN"];
    var twilioFromNumber = config.Twilio["FROM_NUMBER"];
    var twilioClient = new twilio(twilioAccountSid, twilioAuthToken);
    
    function pad(num, size) {
        var s = num + "";
        while (s.length < size) s = "0" + s;
        return s;
    }

    function formatTx(tx) {
        /*TEMP{*
        console.log(tx.hash);
        var txReceipt = web3.eth.getTransactionReceipt(tx.hash);
        var receiptHash = null;
        if (txReceipt.logs && txReceipt.logs.length>0) {
            var logArray = [];
            for (var i=0;i<txReceipt.logs.length;i++) {
                var log = txReceipt.logs[i];
                var out = [];
                if (log.topics) {
                    out = log.topics.slice();
                }
                out.push(log.data)
                logArray.push(out);
            }
            var stringifiedLogArray = JSON.stringify(logArray);
            var logArrayHash = web3.sha3(stringifiedLogArray);
            receiptHash = logArray[0][0].substr(0,10)+logArrayHash.substr(10);
        }
        tx.receiptHash = receiptHash;
        /*}TEMP*/

        var result = {
            hash: tx.hash,
            sender: tx.from
        }
        var input = tx.input;
        var receiptHash = tx.receiptHash;
        if (input.length == CONST_TRANSFER_METHOD_DATA_LENGTH && (input.substr(0, 10) == CONST_TRANSFER_METHOD_SIGNATURE_HASH.substr(0, 10))) {
            result.contract = tx.to;
            result.receiver = "0x" + input.substr(10, 64).replace(/^0+/, '');
            result.amount = parseInt("0x" + input.substr(10 + 64, 64)); //web3.toDecimal("0x"+ input.substr(10+64,64));
            result.verified = (receiptHash && receiptHash.length == CONST_TRANSFER_EVENT_SIGNATURE_HASH.length && (receiptHash.substr(0, 10) == CONST_TRANSFER_EVENT_SIGNATURE_HASH.substr(0, 10)));

            /*
            var expectedReceipt = CONST_TRANSFER_EVENT_SIGNATURE_HASH.substr(0,10) + (tx.from.substr(2),64) + input.substr(10);
            if (expectedReceipt==tx.transactionReceipt) {
                result.verified = true;
            }
            */
        } else {
            result.contract = null;
            result.receiver = tx.to;
            result.amount = tx.value / 1000000000000000000; //web3.fromWei(result.value, 'ether');
            result.verified = true;
        }
        result.tx = tx;
        return result;
    }

    function _isWalletAlreadyRegistered(walletAddress, cb) {
        var call = function (isRegistered) {
            return cb(isRegistered);
        }

        var sql = 'SELECT "walletAddress" FROM public.aditus_wallets WHERE "walletAddress" = ' + " '" + walletAddress + "' AND confirmation_status='CONFIRMED' LIMIT 1;";
        query_db(sql, function (results) {
            call(results && results.length > 0);
        });
    }

    function _isPhoneNumberInUse(phoneNumber, cb) {
        var call = function (isInUse) {
            return cb(isInUse);
        }

        var hash = gethash(phoneNumber);
        var sql = 'SELECT "phone_number_hash" FROM public.aditus_phone_numbers WHERE "phone_number_hash" = ' + " '" + hash + "' LIMIT 1;";
        query_db(sql, function (results) {
            call(results && results.length > 0);
        });
    }

    function _confirmPhoneNumber(walletAddress,confirmationCode,cb) {
        var call = function (successful,message) {
            return cb(successful,message);
        }

        confirmationCode = (confirmationCode) ? ''+confirmationCode: '';
        
        var sql = 'SELECT "walletAddress",confirmation_code,confirmation_expiry,phone_number_hash FROM public.aditus_wallets WHERE "walletAddress" = ' + " '" + walletAddress + "' AND confirmation_status='PENDING' LIMIT 1;";
        query_db(sql,function(results) {
            if (results && results.length > 0) {
                //already exist
                var record = results[0];
                
                var confirmationExpireTime = (record["confirmation_expiry"]) ? parseInt(record["confirmation_expiry"]) : null;
                var code =  (record["confirmation_code"]) ? ''+record["confirmation_code"] : '';

                var date = new Date();
                var timestamp = date.getTime();

                if (!confirmationExpireTime || timestamp>confirmationExpireTime) {
                    call(false,"confirmation has been expired for the given wallet");
                    return;
                }

                if (confirmationCode!==code) {
                    console.log('|'+confirmationCode+'|');
                    console.log('|'+code+'|');
                    call(false,"invalid confirmation code");
                    return;
                }

                var phone_number_hash  = record["phone_number_hash"];
                var confirmation_status = 'CONFIRMED';
                update_db(function (process, finish) {
                    var sqlInsertPhoneNumber = 'INSERT INTO aditus_phone_numbers("phone_number_hash") ' + " VALUES ('" + phone_number_hash + "');";
                    process(sqlInsertPhoneNumber, function () {
                        var sqlWalletAddress = 'UPDATE aditus_wallets SET confirmation_status = $2 WHERE "walletAddress"=$1;';
                        var sql = {
                            query: sqlWalletAddress,
                            values: [walletAddress,confirmation_status]
                        }
                        process(sql, function () {
                            finish();
                        })
                    });
                }, function (result) {
                    call(result);
                });
            } else {
                call(false,"registration has not been initiated for the given wallet address. call register first");
            }
        });
    }

    function genRand() {
        return ''+Math.floor((Math.random()*899999)+100000);
     }
    //TO BE IMPLEMENTED LATER with actual sms verification
    function tempSendSMS(phoneNumber,cb,impersonate) {
        var code = genRand();
        twilioClient.messages.create({
            body: code,
            to: phoneNumber,
            from: twilioFromNumber
        })
        .then((message) => {
            if (message && message.sid) {
                cb(code);
            } else {
                cb(null);
            }
        });
    }

    function _getImpersonateNumber(impersonateAs,cb) {
        var call = function (res) {
            return cb(res);
        }
        var sql = 'SELECT "phoneNumber" FROM public.dev_impersonate_numbers WHERE "impersonateAs" = ' + " '" + impersonateAs + "' LIMIT 1;";
        query_db(sql,function(results) {
            if (results && results.length>0) {
                call(results[0]["phoneNumber"]);
            } else {
                call(null);
            }
        });
    }

    function _getImpersonateList(cb) {
        var call = function (res) {
            return cb(res);
        }
        var sql = 'SELECT "impersonateAs" FROM public.dev_impersonate_numbers;';
        query_db(sql,function(results) {
            call(results);
        });
    }

    function _registerWallet(walletAddress, phoneNumber, cb,impersonateNumber) {
        var call = function (successful,message) {
            return cb(successful,message);
        }
        var sql = 'SELECT "walletAddress",confirmation_retries,confirmation_next_retry_time,confirmation_status FROM public.aditus_wallets WHERE "walletAddress" = ' + " '" + walletAddress + "' LIMIT 1;";
        query_db(sql,function(results) {
            if (results && results.length > 0) {
                //already exist
                var record = results[0];
                
                var expireTime = (record["confirmation_retries"]) ? parseInt(record["confirmation_next_retry_time"]) : null;
                var retries =  (record["confirmation_retries"]) ? parseInt(record["confirmation_retries"]) : 0;

                var date = new Date();
                var timestamp = date.getTime();

                if (expireTime && timestamp<expireTime) {
                    call(false,"too many attampts. wait and try later.");
                    return;
                }

                var hash = gethash(phoneNumber);
                tempSendSMS(impersonateNumber ? impersonateNumber : phoneNumber,function(confirmation_code) {
                    if (!confirmation_code) {
                        call(false,"unable to send sms");
                        return;
                    }
                    var confirmation_expiry = timestamp + 5*60*1000; //add five minutes
                    var confirmation_retries = retries+1;
                    var confirmation_next_retry_time = (confirmation_retries>3) ? confirmation_expiry : timestamp;
                    var confirmation_status = 'PENDING';
                    update_db(function (process, finish) {
                        var sqlWalletAddress = 'UPDATE aditus_wallets SET phone_number_hash = $2, phone_number_temp = $3, confirmation_code = $4, confirmation_expiry = $5, confirmation_retries = $6, confirmation_next_retry_time = $7, confirmation_status = $8 WHERE "walletAddress"=$1;';
                        var sql = {
                            query: sqlWalletAddress,
                            values: [walletAddress,hash,phoneNumber,confirmation_code,confirmation_expiry,confirmation_retries,confirmation_next_retry_time,confirmation_status]
                        }
                        process(sql, function () {
                            finish();
                        })
                    }, function (result) {
                        call(result);
                    });
                });
            } else {
                var date = new Date();
                var timestamp = date.getTime();
                var hash = gethash(phoneNumber);
                tempSendSMS(impersonateNumber ? impersonateNumber: phoneNumber,function(confirmation_code) {
                    if (!confirmation_code) {
                        call(false,"unable to send sms");
                        return;
                    }
                    var confirmation_expiry = timestamp + 5*60*1000; //add five minutes
                    var confirmation_retries = 0;
                    var confirmation_next_retry_time = timestamp;
                    var confirmation_status = 'PENDING';
                    update_db(function (process, finish) {
                        var sqlWalletAddress = 'INSERT INTO aditus_wallets("walletAddress",phone_number_hash,phone_number_temp,confirmation_code,confirmation_expiry,confirmation_retries,confirmation_next_retry_time,confirmation_status) ' + " VALUES ($1, $2, $3, $4, $5, $6, $7, $8);";
                        var sql = {
                            query: sqlWalletAddress,
                            values: [walletAddress,hash,phoneNumber,confirmation_code,confirmation_expiry,confirmation_retries,confirmation_next_retry_time,confirmation_status]
                        }
                        process(sql, function () {
                            finish();
                        })
                    }, function (result) {
                        call(result);
                    });
                });
            }
        });
    }

    function _getTransactionsByWalletAddress(walletAddress, test, skip, cb) {
        var call = function (transactions) {
            if (transactions) {
                var results = [];
                for (var i = 0; i < transactions.length; i++) {
                    results.push(formatTx(transactions[i]));
                }
                return cb(results);
            } else
                return cb([]);
        }

        if (!skip || isNaN(skip) || skip < 1) skip = 0;

        var sql = 'SELECT "blockHash", "blockNumber", "from", gas, "gasPrice", hash, input, nonce, "to", "transactionIndex", value, v, r, s FROM public.transactions' + (test ? '_test' : '') + ' WHERE UPPER("from") = ' + " '" + walletAddress.toUpperCase() + "' " + ' OR UPPER("to") = ' + "'" + walletAddress.toUpperCase() + "' ";

        sql += " LIMIT 25 OFFSET " + skip + ";";
        //console.log(sql);
        query_db(sql, function (results) {
            call(results);
        });
    }

    function _getAllPreferences(skip, cb) {
        var call = function (tokens) {
            return cb(tokens)
        }

        if (!skip || isNaN(skip) || skip < 1) skip = 0;
        var sql = 'SELECT * FROM public.aditus_preferences';
        sql += " LIMIT 25 OFFSET " + skip + ";";
        //console.log(sql);
        query_db(sql, function (results) {
            call(results);
        });
    }

    function _getCustomTokensByWalletAddress(walletAddress, test, skip, cb) {
        var call = function (tokens) {
            return cb(tokens)
        }

        if (!skip || isNaN(skip) || skip < 1) skip = 0;
        var sql = 'SELECT * FROM public."CustomTokens' + (test ? '_test"' : '"') + ' WHERE UPPER("receiver") = ' + " '" + walletAddress.toUpperCase() + "' " + ' OR UPPER("sender") = ' + "'" + walletAddress.toUpperCase() + "' ";
        sql += " LIMIT 25 OFFSET " + skip + ";";
        //console.log(sql);
        query_db(sql, function (results) {
            call(results);
        });
    }

    function _getTransaction(hash, test, cb) {
        var call = function (transaction) {
            if (transaction) {
                return cb(formatTx(transaction));
            } else
                return cb(null);
        }

        var sql = 'SELECT "blockHash", "blockNumber", "from", gas, "gasPrice", hash, input, nonce, "to", "transactionIndex", value, v, r, s FROM public.transactions' + (test ? '_test' : '') + ' WHERE "hash" = ' + " '" + hash + "' LIMIT 1;";
        query_db(sql, function (results) {
            if (results && results.length > 0) {
                call(results[0]);
            } else {
                call(null);
            }
        });
    }


    function _getAllDeals(preferences, skip, cb) {
        var call = function (deals) {
            return cb(deals);
        }
        var values = [];
        if (!skip || isNaN(skip) || skip < 1) skip = 0;
        var sql = 'SELECT public.aditus_deals.*, public.aditus_partners."businessName" FROM public.aditus_deals LEFT JOIN public.aditus_partners ON public.aditus_deals."partnerId" = public.aditus_partners.id ';
        if (preferences && Array.isArray(preferences) && preferences.length > 0) {
            var arrayNames = "$1";
            for (var i = 1; i < preferences.length; i++) {
                arrayNames += ",$" + (i + 1);
            }
            sql += ' WHERE ARRAY[' + arrayNames + '] && "preferencesArray"';
            values = preferences;
        }
        sql += " LIMIT 25 OFFSET " + skip + ";";
        var sql = {
            query: sql,
            values: values
        }
        query_db(sql, function (results) {
            for (result of results) {
                if (result.banner_image) {
                    result.banner_image = image_host + result.banner_image;
                }
            }
            call(results);
        });
    }

    function _getDealsForWallet(walletAddress, newOnly, preferences, skip, cb, ) {
        var call = function (deals) {
            return cb(deals);
        }

        var values = [];
        if (!skip || isNaN(skip) || skip < 1) skip = 0;

        var sql = 'SELECT public.aditus_deals.*, public.aditus_partners."businessName" FROM public.aditus_deals LEFT JOIN public.aditus_partners ON public.aditus_deals."partnerId" = public.aditus_partners.id ';
        if (newOnly) {
            sql += ' WHERE public.aditus_deals."allocatedTokens">public.aditus_deals."spentTokens" ';
            sql += ' AND UPPER(public.aditus_deals."status")=' + "'ACTIVE' ";
            sql += ' AND public.aditus_deals."id" NOT IN ';
            sql += '(SELECT "dealId" FROM public.aditus_deal_claims WHERE "walletAddress" = ' + " '" + walletAddress + "')"
        }
        if (preferences && Array.isArray(preferences) && preferences.length > 0) {
            var arrayNames = "$1";
            for (var i = 1; i < preferences.length; i++) {
                arrayNames += ",$" + (i + 1);
            }
            if (newOnly) {
                sql += ' AND ';
            } else {
                sql += ' WHERE ';
            }
            sql += ' ARRAY[' + arrayNames + '] && "preferencesArray"';
            values = preferences;
        }
        sql += " LIMIT 25 OFFSET " + skip + ";";
        var sql = {
            query: sql,
            values: values
        }
        query_db(sql, function (results) {
            for (var i = 0; i < results.length; ++ i) {
                if (results[i].banner_image) {
                    results[i].banner_image = image_host + results[i].banner_image;
                }
            }
            call(results);
        });
    }

    function _getDeal(id, cb) {
        var call = function (deal) {
            return cb(deal);
        }

        var sql = 'SELECT public.aditus_deals.*, public.aditus_partners."businessName",public.aditus_partners."publicKey" FROM public.aditus_deals LEFT JOIN public.aditus_partners ON public.aditus_deals."partnerId" = public.aditus_partners.id WHERE  public.aditus_deals."id" = ' + " '" + id + "' LIMIT 1;";
        query_db(sql, function (results) {
            if (results && results.length > 0) {
                call(results[0]);
            } else {
                call(null);
            }
        });
    }

    function _getDealClaimForWallet(dealId, walletAddress, cb) {
        var call = function (claim) {
            return cb(claim);
        }

        var sql = 'SELECT * FROM public.aditus_deal_claims WHERE "dealId" = ' + " '" + dealId + "' " + ' AND "walletAddress" = ' + "'" + walletAddress + "' LIMIT 1;";
        query_db(sql, function (results) {
            if (results && results.length > 0) {
                call(results[0]);
            } else {
                call(null);
            }
        });
    }

    function _claimDeal(dealId, walletAddress, userResponseData, partnerResponseData, cb) {
        var call = function (successful, result) {
            return cb(successful, result);
        }


        _getDeal(dealId, function (deal) {
            if (!deal) {
                return call(false, "the deal doens't exist");
            }
            _getDealClaimForWallet(dealId, walletAddress, function (claim) {
                if (claim) {
                    return call(false, "the deal is already claimed by current wallet");
                }

                if (parseInt(deal["spentTokens"]) >= parseInt(deal["allocatedTokens"])) {
                    return call(false, "no more tokens avalilable");
                }
                var numberOfTokens = parseInt(deal["tokensPerRedemption"]);
                var claimId;
                update_db(function (process, finish) {
                    var sqlInsert = 'INSERT INTO aditus_deal_claims("dealId","walletAddress","userResponseData","partnerResponseData","numberOfTokens") ' + " VALUES ('" + dealId + "','" + walletAddress + "','" + userResponseData + "','" + partnerResponseData + "','" + numberOfTokens + "') RETURNING id;";
                    process(sqlInsert, function (res) {
                        claimId = res.rows[0]['id'];
                        deal["spentTokens"] = parseInt(deal["spentTokens"]) + numberOfTokens;
                        var sqlUpdate = 'UPDATE aditus_deals SET "spentTokens"=' + "'" + deal["spentTokens"] + "' ";
                        if (parseInt(deal["spentTokens"]) >= parseInt(deal["allocatedTokens"])) {
                            sqlUpdate += ', "status"=' + "'Closed' ";
                        }
                        sqlUpdate += ' WHERE "id"=' + "'" + dealId + "';";
                        process(sqlUpdate, function () {
                            finish();
                        });
                    });
                }, function (result) {
							
                    if (result) {
                        call(true, claimId);
                        /*
                        var sql = "SELECT currval('aditus_deal_claims_id_seq');"
                        query_db(sql, function (results) {
                            if (results && results.length > 0) {
                                var claimId = results[0];
                                call(true,claimId);
                            }
                        });
                        */
                    }
                });
            });
        });
    }

    function _updateDetails(walletAddress, details, cb) {
        var call = function (successful) {
            return cb(successful);
        }

        update_db(function (process, finish) {
            var sql = 'UPDATE public.aditus_wallets SET "userDetails" = ' + "'" + details + "' WHERE " + ' "walletAddress"= ' + "'" + walletAddress + "';";
            process(sql, function () {
                finish();
            });
        }, function (result) {
            call(result);
        });
    }

    function _fetchDetails(walletAddress, cb) {
        var call = function (successful) {
            return cb(successful);
        }

        var sql = 'SELECT "userDetails" FROM public.aditus_wallets WHERE "walletAddress" = ' + " '" + walletAddress + "' LIMIT 1;";
        query_db(sql, function (results) {
            if (results && results.length > 0) {
                var record = results[0];
                call(record["userDetails"]);
            } else {
                call(null);
            }
        });
    }
    
    function _updateScanContent(walletAddress, contents, cb) {
        var call = function (successful) {
            return cb(successful);
        }

        update_db(function (process, finish) {
            var sql = "INSERT INTO public.aditus_scans(walletAddress,contents) VALUES ('" + walletAddress + "', '" + contents + "');";
            process(sql, function () {
                finish();
            });
        }, function (result) {
            call(result);
        });
    }

    function _getTestWallets(cb) {
        var call = function (successful) {
            return cb(successful);
        }

        var sql = 'SELECT "from" FROM public.transactions LIMIT 10;';
        query_db(sql, function (results) {
            var addresses = [];
            for (var i = 0; i < results.length; i++) {
                var result = results[i];
                addresses.push(result["from"]);
            }

            call(addresses);
        });
    }

    function _setPreferencesForNotificationId(notificationId, preferences, cb) {
        var call = function (successful, message) {
            return cb(successful, message);
        }

        if (!notificationId) {
            cb(false, null);
            return;
        }

        if (!preferences || !Array.isArray(preferences)) {
            cb(false, null);
            return;
        }

        var values = [];
        var arrayNames = '';
        if (preferences.length > 0) {
            arrayNames = "$1";
            for (var i = 1; i < preferences.length; i++) {
                arrayNames += ",$" + (i + 1);
            }
            values = preferences;
        }

        var sql = "SELECT count(*) as cnt from public.aditus_notificationids WHERE notificationid='" + notificationId + "'";
        query_db(sql, function (results) {
            var count = results[0].cnt;
            if (count < 1) {
                update_db(function (process, finish) {
                    var insertQuery = 'INSERT INTO public.aditus_notificationids(notificationid,"preferencesArray") VALUES (' + "'" + notificationId + "', ARRAY[" + arrayNames + "]);";
                    var sql = {
                        query: insertQuery,
                        values: values
                    };
                    process(sql, function () {
                        finish();
                    });
                }, function (result) {
                    call(result, null);
                });
            } else {
                update_db(function (process, finish) {
                    var updateQuery = 'UPDATE public.aditus_notificationids SET "preferencesArray" = ARRAY[' + arrayNames + '] WHERE notificationid=' + "'" + notificationId + "'";
                    var sql = {
                        query: updateQuery,
                        values: values
                    };
                    process(sql, function () {
                        finish();
                    });
                }, function (result) {
                    call(result, null);
                });
            }
        });
    }


    function _changeNotificationId(oldNotificationId, newNotificationId, cb) {
        var call = function (successful, message) {
            return cb(successful, message);
        }

        if (!oldNotificationId) {
            cb(false, null);
            return;
        }

        if (!newNotificationId) {
            cb(false, null);
            return;
        }

        var sql = "SELECT count(*) as cnt from public.aditus_notificationids WHERE notificationid='" + oldNotificationId + "';";
        query_db(sql, function (results) {
            var count = results[0].cnt;
            if (count < 1) {
                call(false, 'old notification id does not exist');
            } else {
                var sql2 = "SELECT count(*) as cnt from public.aditus_notificationids WHERE notificationid='" + newNotificationId + "';";
                query_db(sql2, function (results2) {
                    var count2 = results2[0].cnt;
                    if (count2 > 0) {
                        call(false, 'new notification id already exists');
                    } else {
                        update_db(function (process, finish) {
                            var updateQuery = "UPDATE public.aditus_notificationids SET notificationid = '" + newNotificationId + "' WHERE notificationid='" + oldNotificationId + "'";
                            process(updateQuery, function () {
                                finish();
                            });
                        }, function (result) {
                            call(result, null);
                        });
                    }
                });
            }
        });
    }
    
    function _fetchSlider(cb) {
        var call = function (successful, res) {
            return cb(successful, res);
        }

        var sql = "SELECT count(*) as cnt from public.aditus_deals_adv WHERE isdeleted = false AND isactive = true;";
        query_db(sql, function (results) {
            var count = results[0].cnt;
            if (count < 1) {
                call(false, 'slider does not exist');
            } else {
                var sql2 = 'SELECT * FROM public.aditus_deals_adv WHERE isdeleted = false AND isactive = true;';
                query_db(sql2, function (results) {
                    for (index in results) {
                        if (results[index].banner_image) {
                            results[index].banner_image = image_host + results[index].banner_image;
                        }
                    }
                    call(true,results);
                });
            }
        });
    }
    
    function _fetchDealPrefs(cb) {
        var call = function (successful, res) {
            return cb(successful, res);
        }

        var sql = "SELECT count(*) as cnt from public.aditus_preferences WHERE home_display = true;";
        query_db(sql, function (results) {
            var count = results[0].cnt;
            if (count < 1) {
                call(false, 'prefs does not exist');
            } else {
                var sql2 = 'SELECT * FROM public.aditus_preferences WHERE home_display = true;';
                query_db(sql2, function (results) {
                    call(true, results);
                });
            }
        });
    }

    return {
        isWalletAlreadyRegistered: _isWalletAlreadyRegistered,
        isPhoneNumberInUse: _isPhoneNumberInUse,
        registerWallet: _registerWallet,
        getTransactionsByWalletAddress: _getTransactionsByWalletAddress,
        getCustomTokensByWalletAddress: _getCustomTokensByWalletAddress,
        getTransaction: _getTransaction,
        getAllDeals: _getAllDeals,
        getDealsForWallet: _getDealsForWallet,
        getDeal: _getDeal,
        getDealClaimForWallet: _getDealClaimForWallet,
        claimDeal: _claimDeal,
        updateDetails: _updateDetails,
        fetchDetails: _fetchDetails,
        getAllPreferences: _getAllPreferences,
        getTestWallets: _getTestWallets,
        setPreferencesForNotificationId: _setPreferencesForNotificationId,
        changeNotificationId: _changeNotificationId,
        fetchSlider: _fetchSlider,
        updateScanContent: _updateScanContent,
        confirmPhoneNumber: _confirmPhoneNumber,
        fetchDealPrefs: _fetchDealPrefs,
        getImpersonateNumber: _getImpersonateNumber,
        getImpersonateList: _getImpersonateList
    }
}

module.exports = service;