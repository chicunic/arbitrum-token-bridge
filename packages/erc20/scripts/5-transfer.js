require('dotenv').config();
const { providers, Wallet } = require('ethers');
const Bridge = require('../utils/Bridge');
const getNetworks = require('../utils/getNetworks');

const l1Provider = new providers.JsonRpcProvider(process.env.L1_RPC);
const l2Provider = new providers.JsonRpcProvider(process.env.L2_RPC);

const l1Signer = new Wallet(process.env.L1_PRIVKEY, l1Provider);
const l2Signer = new Wallet(process.env.L2_PRIVKEY, l2Provider);

async function main() {
  const { l1Network, l2Network } = await getNetworks(l1Signer, l2Signer);
  const bridge = await Bridge.init(l1Signer, l2Signer, { isCustomNetwork: { l1Network, l2Network } });

  console.log('5 - Transfer ERC20 from L1 to L2');
  const amount = '1';
  const approveTx = await bridge.approveToken(process.env.L1_ERC20, amount);
  await approveTx.wait();
  console.log('1-1: approved');

  const depositTx = await bridge.deposit({ l1TokenAddress: process.env.L1_ERC20, amount });
  const depositRec = await depositTx.wait();
  const seqNumArr = await bridge.getInboxSeqNumFromContractTransaction(depositRec);
  const seqNum = seqNumArr[0];
  console.log('1-2 seq', seqNum.toNumber());

  const retryableTicket = await bridge.calculateL2TransactionHash(seqNum);
  console.log('1-3: retryableTicket', retryableTicket);
  const autoRedeem = await bridge.calculateRetryableAutoRedeemTxnHash(seqNum);
  console.log('1-4: autoRedeem', autoRedeem);
  const redeemTransaction = await bridge.calculateL2RetryableTransactionHash(seqNum);
  console.log('1-5: redeemTransaction', redeemTransaction);

  console.log('1-6: waiting for L2 transaction');
  const l2TxnRec = await l2Provider.waitForTransaction(redeemTransaction, undefined, 1000 * 60 * 12);
  console.log('     Done! txid', l2TxnRec.transactionHash);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
