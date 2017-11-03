//dependancies: lightwallet

var EthWallet = (function () {
    var CONST_TOKEN_ABI = [{ "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "payable": false, "type": "function" }, { "constant": false, "inputs": [{ "name": "_spender", "type": "address" }, { "name": "_amount", "type": "uint256" }], "name": "approve", "outputs": [{ "name": "success", "type": "bool" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [], "name": "totalSupply", "outputs": [{ "name": "totalSupply", "type": "uint256" }], "payable": false, "type": "function" }, { "constant": false, "inputs": [{ "name": "_from", "type": "address" }, { "name": "_to", "type": "address" }, { "name": "_amount", "type": "uint256" }], "name": "transferFrom", "outputs": [{ "name": "success", "type": "bool" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }], "name": "balanceOf", "outputs": [{ "name": "balance", "type": "uint256" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [], "name": "owner", "outputs": [{ "name": "", "type": "address" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "payable": false, "type": "function" }, { "constant": false, "inputs": [{ "name": "_to", "type": "address" }, { "name": "_amount", "type": "uint256" }], "name": "transfer", "outputs": [{ "name": "success", "type": "bool" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [], "name": "sayHelloTSP", "outputs": [{ "name": "sayHelloTSP", "type": "string" }], "payable": false, "type": "function" }, { "constant": true, "inputs": [{ "name": "_owner", "type": "address" }, { "name": "_spender", "type": "address" }], "name": "allowance", "outputs": [{ "name": "remaining", "type": "uint256" }], "payable": false, "type": "function" }, { "inputs": [], "payable": false, "type": "constructor" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_from", "type": "address" }, { "indexed": true, "name": "_to", "type": "address" }, { "indexed": false, "name": "_value", "type": "uint256" }], "name": "Transfer", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "name": "_owner", "type": "address" }, { "indexed": true, "name": "_spender", "type": "address" }, { "indexed": false, "name": "_value", "type": "uint256" }], "name": "Approval", "type": "event" }];
    var CONST_TOKEN_ADDRESS = '0xe2d193b7769202d58239dc312143d5ccc74b7e4c';
    var CONST_TRANSFER_METHOD_SIGNATURE = "transfer(address,uint256)";
    var CONST_MESSAGE_NOT_INITIATED = "the wallet hasn't been initiated yet";
    var CONST_MESSAGE_INVALID_AMOUNT = 'invalid amount';
    var CONST_GAS_RATIO = 1.5;
    var CONST_MIN_GAS_PRICE = 21000000000; //21GWEI

    var web3 = new Web3();
    var wallet_id;
    var tsp_token;
    var storekey = {};

    var private = {
        _transfer: function (isTSP, to, amount, cb) {
            if (!wallet_id) {
                console.warn(CONST_MESSAGE_NOT_INITIATED);
                cb(null);
                return;
            }
            if (!amount || isNaN(amount) || !(amount > 0)) {
                console.warn(CONST_MESSAGE_INVALID_AMOUNT);
                cb(null);
                return;
            }
            if (isTSP) {
                var tspBalance = tsp_token.balanceOf(wallet_id);
                if (!tspBalance ||  isNaN(tspBalance) || tspBalance<amount) {
                    console.warn(CONST_MESSAGE_INVALID_AMOUNT);
                    cb(null);
                    return;
                }
            }
            try {
                web3.eth.getGasPrice(function (error, gasPrice) {
                    if (error) {
                        console.warn(error);
                        cb(null);
                        return;
                    }
                    if (CONST_MIN_GAS_PRICE > gasPrice) {
                        gasPrice = CONST_MIN_GAS_PRICE;
                    }
                    var callObject = {
                        from: wallet_id,
                        gasPrice: gasPrice
                    };
                    var onTransactionStartedCallback = function (error, hash) {
                        if (error) {
                            console.warn(error);
                            cb(null);
                            return;
                        }
                        cb(hash);
                        return;
                    }
                    if (isTSP) {
                        var gasLimit = tsp_token.transfer.estimateGas(to, amount, callObject);
                        callObject.gas = gasLimit * CONST_GAS_RATIO;
                        tsp_token.transfer.sendTransaction(to, amount, callObject, onTransactionStartedCallback);
                    } else {
                        callObject.value = web3.toWei(amount, 'ether');
                        callObject.to = to;
                        var gasLimit = web3.eth.estimateGas(callObject);
                        callObject.gas = gasLimit * CONST_GAS_RATIO;
                        web3.eth.sendTransaction(callObject, onTransactionStartedCallback);
                    }
                });
            } catch (err) {
                console.warn(err);
                cb(null);
                return;
            }
        }
    }
    return {
        generatePassphase: function (seed) {
            var passphase = lightwallet.keystore.generateRandomSeed(seed);
            return passphase;
        },
        isValidMnemonic: function(text) {
            return lightwallet.keystore.isValidMnemonic(text);
        },
        initWallet: function (host, passphase, pw, cb) {
            var numberOfAddresses = 1;
            var fnProcessKeyStore = function(keystore,pwDerivedKey) {
                keystore.generateNewAddress(pwDerivedKey, numberOfAddresses);
                var addresses = keystore.getAddresses();
                for (var i = 0; i < addresses.length; ++i) {
                    wallet_id = '0x' + addresses[i];
                }
                keystore.passwordProvider = function (callback) {
                    callback(null, pw);
                };

                var web3Provider = new HookedWeb3Provider({
                    host: host,
                    transaction_signer: keystore
                });
                storekey.transaction_signer = keystore;
                web3.setProvider(web3Provider);

                if (!tsp_token) tsp_token = web3.eth.contract(CONST_TOKEN_ABI).at(CONST_TOKEN_ADDRESS);
                cb(true);
            };
            /*
            lightwallet.keystore.createVault({
                password: pw,
                seedPhrase: passphase
            }, function (error, keystore) {
                if (error) {
                    console.warn(error);
                    cb(null);
                    return;
                }
                keystore.keyFromPassword(pw, function (err, pwDerivedKey) {
                    if (error) {
                        console.warn(error);
                        cb(null);
                        return;
                    }
                    fnProcessKeyStore(keystore);
                });
            });
            */
            lightwallet.keystore.deriveKeyFromPassword(pw, function (error, pwDerivedKey) {
                if (error) {
                    console.warn(error);
                    cb(null);
                    return;
                }
                var keystore = new lightwallet.keystore(passphase, pwDerivedKey);
                fnProcessKeyStore(keystore,pwDerivedKey);
           });
        },
        getWalletId: function () {
            return wallet_id;
        },
        encryptData: function (data,cb) {
            if (!wallet_id) {
                console.warn(CONST_MESSAGE_NOT_INITIATED);
                cb(null);
                return;
            }
            storekey.transaction_signer.encryptData(wallet_id,data,function(err,encryptedData) {
                if (err) {
                    console.log("error");
                    cb(null);                
                } else {
                    cb(encryptedData);
                }
                
            })
        },
        decryptData: function (encrypted,cb) {
            if (!wallet_id) {
                console.warn(CONST_MESSAGE_NOT_INITIATED);
                cb(null);
                return;
            }
            storekey.transaction_signer.decryptData(wallet_id,encrypted,function(err,data) {
                if (err) {
                    console.log("error");
                    cb(null);                
                } else {
                    cb(data);
                }
                
            })
        },
        hashData: function (data,cb) {
            var hash = CryptoJS.SHA3(data, { outputLength: 256 }).toString(CryptoJS.enc.Hex);
            if (cb) {
                cb(hash);
            } else {
                return hash;
            }
        },
        encryptDataWithPublicKey: function (data,pubKey,cb) {
            var key = new NodeRSA(pubKey);
            if(!key.isPublic()) {
                throw new Error();
            }
            var encrypted = key.encrypt(data, 'base64');
            return encrypted;
        },
        signMessage: function (msg,cb) {
            if (!wallet_id) {
                console.warn(CONST_MESSAGE_NOT_INITIATED);
                cb(null);
                return;
            }
            storekey.transaction_signer.signMessage(wallet_id,msg,function(err,signObject,signature,encodedMessage) {
                if (err) {
                    console.log("error");
                    cb(null);                
                } else {
                    cb(signature,encodedMessage);
                }
                
            })
        },
        getETHBalance: function (cb) {
            if (!wallet_id) {
                console.warn(CONST_MESSAGE_NOT_INITIATED);
                cb(null);
                return;
            }
            web3.eth.getBalance(wallet_id, function (error, balance) {
                if (error) {
                    console.warn(error);
                    cb(null);
                    return;
                }
                var etherBalance = web3.fromWei(balance, 'ether');
                cb(etherBalance);
            });
        },
        getTSPBalance: function (cb) {
            if (!wallet_id) {
                console.warn(CONST_MESSAGE_NOT_INITIATED);
                cb(null);
                return;
            }
            var tspBalance = tsp_token.balanceOf(wallet_id);
            if (cb) cb(tspBalance);
            return tspBalance;
        },
        transferETH: function (to, amount, cb) {
            private._transfer(false, to, amount, cb);
        },
        transferTSP: function (to, amount, cb) {
            private._transfer(true, to, amount, cb);
        },
        callOnTxComplete: function(txHash,cb,delay) {
            if (!delay) delay = 4000;
    
            var tx = web3.eth.getTransaction(txHash);
            if (!tx) {
                cb(false);
            } else if (tx.blockNumber) {
                cb(true);
            } else {
                var txChecker = setInterval(function() {
                    var tx = web3.eth.getTransaction(txHash);
                    if (!tx) {
                        clearInterval(txChecker);
                        cb(false);
                    } else if (tx.blockNumber) {
                        clearInterval(txChecker);
                        cb(true);
                    }
                },delay);
                return txChecker;
            }
        },
        getTransactionStatusById: function (txHash) {
            if (!wallet_id) {
                console.warn(CONST_MESSAGE_NOT_INITIATED);
                return;
            }
            var tx = web3.eth.getTransaction(txHash);
            var result;
            if (!tx) {
                result = {
                    exist: false
                };
            } else {
                result = {
                    exist: true,
                    value: tx.value,
                    to: tx.to,
                    from: tx.from
                };
                var input = tx.input;
                if (tx.to==CONST_TOKEN_ADDRESS && input.length==(10+64+64) && (input.substr(0,10)==web3.sha3(CONST_TRANSFER_METHOD_SIGNATURE).substr(0,10))) {
                    result.currency = "TSP";
                    result.address = "0x" + input.substr(10,64).replace(/^0+/, '');
                    result.amount = parseInt("0x"+ input.substr(10+64,64)); //web3.toDecimal("0x"+ input.substr(10+64,64));
                    result.transferValue = result.amount;
                } else {
                    result.currency = 'ETH';
                    result.transferValue = result.value/1000000000000000000; //web3.fromWei(result.value, 'ether');
                }
                if (tx.blockNumber) {
                    result.completed = true;
                }
            }
            return result;
        }
    }
}());