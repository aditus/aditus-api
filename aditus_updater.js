const Web3 = require('web3');

const aditus_pgconnect = require('./common/aditus_pgconnect.js');

const config = require('./aditus_config.json');

const CONST_CONNECTION_STR = config["CONNECTION_STRING"];

const CONST_ETH_NODE_URL = config["ETH_NODE"];

const testEnabled = (config["TEST"]) ? true : false;

var web3 = new Web3(new Web3.providers.HttpProvider(CONST_ETH_NODE_URL));

const pgconnect = aditus_pgconnect(CONST_CONNECTION_STR);

const query_db = pgconnect.query_db;
const update_db = pgconnect.update_db;

function testSuffix() {
	return (testEnabled) ? '_test' : '';
}

function saveBlock(process, block, cb) {
	console.log("Inserting Block : " + block.number + ", transactions : " + block.transactions.length);

	var insertBlockSQLTemplate = 'INSERT INTO public.blocks'+testSuffix()+'(difficulty, "extraData", "gasLimit", "gasUsed", "logsBloom", miner, "mixHash", nonce, "number", "parentHash", "receiptsRoot", "sha3Uncles", size, "stateRoot", "timestamp", "timestampParsed", "totalDifficulty", "transactionsRoot", hash) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, to_timestamp($16) AT TIME ZONE \'UTC\', $17, $18, $19);';
	var values = [parseInt(block.difficulty), block.extraData, parseInt(block.gasLimit), parseInt(block.gasUsed), block.logsBloom, block.miner, block.mixHash, block.nonce, parseInt(block.number), block.parentHash, block.receiptsRoot, block.sha3Uncles, parseInt(block.size), block.stateRoot, parseInt(block.timestamp), parseInt(block.timestamp), parseInt(block.totalDifficulty), block.transactionsRoot, block.hash];
	var sql = {
		query: insertBlockSQLTemplate,
		values: values
	}
	process(sql, cb);
}

function saveTransaction(process, tx, cb) {
	console.log('Inserting '+tx.hash);
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
	var insertTransactionSQLTemplate = 'INSERT INTO public.transactions'+testSuffix()+'("blockHash", "blockNumber", "from", gas, "gasPrice", hash, input, nonce, "to", "transactionIndex", value, v, r, s,"receiptHash") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,$15);';
	values = [tx.blockHash, parseInt(tx.blockNumber), tx.from, parseInt(tx.gas), parseInt(tx.gasPrice), tx.hash, tx.input, parseInt(tx.nonce), tx.to, parseInt(tx.transactionIndex), parseInt(tx.value), tx.v, tx.r, tx.s,receiptHash];
	var sql = {
		query: insertTransactionSQLTemplate,
		values: values
	}
	process(sql, cb);
}

function saveTransactionsForBlock(process, block, cb) {
	console.log("Inserting Transaction for block : " + block.number + ", transactions : " + block.transactions.length);

	var lastFn = cb;
	for (var j = block.transactions.length - 1; j >= 0; j--) {
		var txn = block.transactions[j];
		function getFn() {
			var o = {
				process: process,
				txn: txn,
				lastFn: lastFn
			};
			return function () {
				saveTransaction(o.process, o.txn, o.lastFn);
			};
		}
		lastFn = getFn();
	}
	lastFn();
}

function saveBlockWithTransactions(process, block, cb) {
	saveBlock(process, block, function () {
		saveTransactionsForBlock(process, block, cb);
	});
}

function clearBlockTransactions(process, block, cb) {
	console.log("Clearing Block Transactions for block number: " + block.number);

	var sql = 'DELETE FROM public.transactions'+testSuffix()+' as txns WHERE txns."blockNumber" = $1;';
	var values = [block.number];
	var sql = {
		query: sql,
		values: values
	}
	process(sql, cb);
}

function clearAndSaveBlockTransactions(process, block, cb) {
	clearBlockTransactions(process, block, function () {
		saveTransactionsForBlock(process, block, cb);
	});
}

function checkBlock(start, end) {
	if (start > end) {
		console.log("waiting... "+(testEnabled ? '(TESTNET)' : '(MAINNET)'));
		function setupTimeout() {
			var o = {
				lastBlock: end
			};
			setTimeout(function() {
				web3.eth.getBlockNumber(function(error,num) {
					if (error) {
						console.log(error);
			
						console.log("Cooling down for 5 seconds")
			
						var waitTill = new Date(new Date().getTime() + (5 * 1000));
						while (waitTill > new Date()) { }
						checkBlock(o.lastBlock+1, o.lastBlock);
						return;
					}
					console.log('Checking blocks to from ' + o.lastBlock +' to ' + num);
					checkBlock(o.lastBlock,num);
				});
			},5000);
		}
		setupTimeout();
		return;
	}

	web3.eth.getBlock(start, true, function (error, block) {
		if (error) {
			console.log(error);

			console.log("Cooling down for 5 seconds")

			var waitTill = new Date(new Date().getTime() + (5 * 1000));
			while (waitTill > new Date()) { }
			checkBlock(start, end);
			return;
		}

		console.log("Checking Block : " + block.number +' in mainnet');

		query_db({
			query: 'Select count(*) as cnt from public.blocks'+testSuffix()+' as blocks where blocks."number" = $1',
			values: [start]
		}, function (results) {
			var blockCount = results[0].cnt;
			if (!blockCount || blockCount < 1) {
				console.log("Block not found. Inserting Block : " + block.number);
				update_db(function (process, finish) {
					saveBlockWithTransactions(process, block, function () {
						finish();
					});
				}, function (result) {
					console.log('done saving block');
					checkBlock(start + 1, end);
				});
			} else {
				console.log("Block found.");
				query_db({
					query: 'Select count(*) as cnt from public.transactions'+testSuffix()+' as txns where txns."blockNumber" = $1',
					values: [start]
				}, function (results) {
					var count = results[0].cnt;
					if (count == block.transactions.length) {
						console.log("Block : " + block.number + " verified");
						checkBlock(start + 1, end);
					} else {
						console.log("Block : " + block.number + " corrupted");
						console.log("transactions in db: "+ count);
						console.log("transactions in block: "+ block.transactions.length);
						

						update_db(function (process, finish) {
							clearAndSaveBlockTransactions(process, block, function () {
								finish();
							});
						}, function (result) {
							console.log('done saving block' + block.number);
							checkBlock(start + 1, end);
						});
					}
				})
			}

		})
	})

}

function startUpdating() {
	web3.eth.getBlockNumber(function(error,num) {
		if (error) {
			console.log(error);
	
			console.log("Cooling down for 5 seconds")
	
			var waitTill = new Date(new Date().getTime() + (5 * 1000));
			while (waitTill > new Date()) { }
			startUpdating();
			return;
		}
		console.log('Checking last block');

		query_db('Select max(number) as mx from public.blocks'+testSuffix(), function (results) {
			var max = 0;
			if (results && results.length>0) {
				max = results[0].mx;
				console.log(max);
			}
				

			max = max - 100;
			if (max<0)
				max = 0;

			console.log('Checking blocks from '+max+' to ' +num);
			checkBlock(max,num);
		});
		
	});
}

startUpdating();
