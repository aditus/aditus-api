

function attachAditusDocumentation(router) {

    router.get('/dev/hash', function (req, res) {
        res.json({
            description: "returns the hash of a data",
            requestFormat: {
                data: "<data>"
            },
            responseFormat: {
                data: "<data>",
                hash: "<data-hash>"
            }
        });
    });
    router.get('/dev/sign', function (req, res) {
        res.json({
            description: "signs data with a given private key",
            requestFormat: {
                privKey: "<private-key>",
                data: "<data-as-json-or-text>"
            },
            responseFormat: {
                data: "<data>",
                signature: "<data-signature>",
                encoded: "<data-encoded-with-signature>"
            }
        });
    });

    router.get('/dev/wallets', function (req, res) {
        res.json({
            description: "returns few sample wallets",
            requestFormat: "<nodata>",
            responseFormat: {
                success: "<true|false>",
                wallets: ["0x<wallet-address-1>", "0x<wallet-address-2>", "0x..."]
            }
        });
    });


    router.get('/dev/encrypt', function (req, res) {
        res.json({
            description: "encrypts data with a given private key",
            requestFormat: {
                userKey: "<user's-private-key>",
                data: "<data>"
            },
            responseFormat: {
                data: "<data>",
                encrypted: "<encrypted-data>"
            }
        });
    });
    router.get('/dev/decrypt', function (req, res) {
        res.json({
            description: "decrypts data with a given private key",
            requestFormat: {
                userKey: "<user's-private-key>",
                encrypted: "<encrypted-data>"
            },
            responseFormat: {
                data: "<decrypted-data>"
            }
        });
    });

    router.get('/dev/encryptforpartner', function (req, res) {
        res.json({
            description: "encrypts data with a given rsa public key",
            requestFormat: {
                pubKey: "<partner's-public-key>",
                data: "<data>"
            },
            responseFormat: {
                data: "<data>",
                encrypted: "<encrypted-data>"
            }
        });
    });

    router.get('/dev/checkphonenumber', function (req, res) {
        res.json({
            description: "checks whether phonenumber exists",
            requestFormat: {
                phoneNumber: "<phone-number>"
            },
            responseFormat: {
                success: "<true-if-phone-number-exists>",
                message: "<message>"
            }
        });
    });

    router.get('/register', function (req, res) {
        res.json({
            description: "register user",
            dataFormatToBeEncrypted: {
                phoneNumber: "<phone-number>"
            },
            requestFormat: {
                signature: "<signature>",
                data: "<encrypted-json>"
            },
            responseFormat: {
                success: "<true|false>",
                message: "<message>"
            }
        });
    });

    router.get('/', function (req, res) {
        res.json({
            description: "aditus simple api",
            requestFormat: {
                signature: "<signature>",
                data: ""
            },
            responseFormat: {
                message: 'aditus simple api',
                received: {
                    walletAddress: "<wallet-address>",
                    data: "<request-data>"
                }
            },
            info: "make a get call to methods to read details and see sub methods",
            devMethods: [
                "/api/dev/hash",
                "/api/dev/sign",
                "/api/dev/encrypt",
                "/api/dev/decrypt",
                "/api/dev/encryptforpartner",
                "/api/dev/wallets",
                "/api/dev/checkphonenumber"
            ],
            methods: [
                "/api/register",
                ["/api/transactions", "/api/transactions/:hash"],
                ["/api/deals", "/api/deals/:id", "/api/deals/:id/claim"],
                '/api/preferences',
                '/api/setPreferences',
                '/api/changeNotificationId',
                "/api/updateDetails",
                "/api/fetchDetails"
            ],
            signing: {
                "note":"other than /dev methods, all other methods require that request data to be signed with private key of the wallet owner. this is supposed to be done on client's side. however in order to test, /api/dev/sign can be used. you can make requests in either of 2 following formats",
                "format1" : {
                    "signature": "<signature>",
                    "data": "<data-as-JSON-or-string>"
                },
                "format2" : {
                    "encoded": "<encoded-data(signature-included)>"
                },
                "furtherNote" :"please refer /api/dev/sign for more details. for client side implementation of encoding: '...var encoded = rlp.encode(JSON.stringify({data: data, signature: signature})).toString('hex');...'"
            }
        });
    });
    router.get('/transactions', function (req, res) {
        res.json({
            method: "/api/transactions",
            description: "returns transactions of the current wallet (or a given wallet)",
            requestFormat: {
                signature: "<signature>",
                data: {
                    "wallet": "<wallet-address(optional-field)>"
                }
            },
            responseFormat: {
                success: '<true|false>',
                results: ["{...}", "{..<transactions-as-an-array>..}", "{...}"]
            },
            subMethods: [
                {
                    method: "/api/transactions/:hash",
                    requestFormat: {
                        signature: "<signature>",
                        data: ""
                    },
                    responseFormat: {
                        success: '<true|false>',
                        results: {
                            "blockHash": "<blockHash>",
                            "blockNumber": "<blockNumber>",
                            "from": "<from>",
                            "gas": "<gas>",
                            "gasPrice": "<gasPrice>",
                            "hash": "<hash>",
                            "input": "<input>",
                            "nonce": "<nonce>",
                            "to": "<to>",
                            "transactionIndex": "<transactionIndex>",
                            "value": "<value?",
                            "v": "<v>",
                            "r": "<r>",
                            "s": "<s>"
                        }
                    }
                }
            ]
        });
    });
    router.get('/deals', function (req, res) {
        res.json({
            method: "/api/deals",
            description: "returns deals for a given address",
            requestFormat: {
                signature: "<signature>",
                data: {
                    "newOnly": "<true|false:ignores-already-claimed-deals(optional-field)>"
                }
            },
            responseFormat: {
                success: '<true|false>',
                results: ["{...}", "{..<deals-as-an-array>..}", "{...}"]
            },
            info: "make a get call to methods to read details and see sub methods",
            subMethods: [
                {
                    method: "/api/deals/:id",
                    requestFormat: {
                        signature: "<signature>",
                        data: ""
                    },
                    responseFormat: {
                        success: '<true|false>',
                        result: {
                            "deal": {
                                "id": "<id>",
                                "dealname": "<dealname>",
                                "description": "<description>",
                                "dealtype": "<RequestInfo|TokenOffer>",
                                "startdate": "<startdate>",
                                "enddate": "<enddate>",
                                "tokensPerRedemption": "<tokensPerRedemption>",
                                "totalRedemption": "<totalRedemption>",
                                "spentTokens": "<spentTokens>",
                                "status": "<Active|Closed>",
                                "formData": "<formData-in-a-format-like-stringified-JSON>",
                                "allocatedTokens": "<allocatedTokens>"
                            },
                            "claimed": "<true|false>",
                            "claim": "<claim(can-be-null)>"
                        }
                    }
                },
                {
                    method: "/api/deals/:id/claim",
                    requestFormat: {
                        signature: "<signature>",
                        data: {
                            userResponseData: "<userResponseData>",
                            userResponseDataHash: "<userResponseDataHash>",
                            partnerResponseData: "<partnerResponseData>",
                            partnerResponseDataHash: "<partnerResponseDataHash>"
                        }
                    },
                    responseFormat: {
                        success: '<true|false>',
                        message: "<message>"
                    }
                }
            ]
        });
    });
    
    router.get('/preferences', function (req, res) {
        res.json({
            description: "returns all preferences",
            requestFormat: "",
            responseFormat: {
                success: '<true|false>',
                results: [ {
                    "name":"<preference-name>",
                    "details": "<details-as-json>"
                }]
            }
        });
    });
    
    router.get('/setPreferences', function (req, res) {
        res.json({
            description: "set preferences for a notification id",
            requestFormat: {
                notificationId: "<notification-id>",
                preferences: ['<preference-1>','<preference-2>','...']
            },
            responseFormat: {
                success: '<true|false>',
                message: "<message>"
            }
        });
    });
    
    router.get('/changeNotificationId', function (req, res) {
        res.json({
            description: "changes notification id",
            requestFormat: {
                oldNotificationId: "<old-notification-id>",
                newNotificationId: "<new-notification-id>"
            },
            responseFormat: {
                success: '<true|false>',
                message: "<message>"
            }
        });
    });
    router.get('/updateDetails', function (req, res) {
        res.json({
            description: "update user details",
            requestFormat: {
                signature: "<signature>",
                data: {
                    "details": "<user-details>"
                }
            },
            responseFormat: {
                success: '<true|false>',
                message: "<message>"
            }
        });
    });
    router.get('/fetchDetails', function (req, res) {
        res.json({
            description: "get user details",
            requestFormat: {
                signature: "<signature>",
                data: ""
            },
            responseFormat: {
                success: '<true|false>',
                details: "<user-details>"
            }
        });
    });
}

module.exports = attachAditusDocumentation;