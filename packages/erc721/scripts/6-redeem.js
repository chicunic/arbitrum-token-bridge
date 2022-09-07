require('dotenv').config();
const { providers, Wallet } = require('ethers');
const { L1TransactionReceipt, L1ToL2MessageStatus } = require('@arbitrum/sdk');

const l1Provider = new providers.JsonRpcProvider(process.env.L1_RPC);
const l2Provider = new providers.JsonRpcProvider(process.env.L2_RPC);

const l2Signer = new Wallet(process.env.L2_PRIVKEY, l2Provider);

const txid = '';

async function main() {
  console.log('6 - Redeem');
  const transactionReceipt = await l1Provider.getTransactionReceipt(txid);
  const l1TxnReceipt = new L1TransactionReceipt(transactionReceipt);
  const l1ToL2Message = await l1TxnReceipt.getL1ToL2Message(l2Signer);
  console.log('1: l1ToL2Message', l1ToL2Message);
  const res = await l1ToL2Message.waitForStatus();
  console.log('2: l1ToL2Message', res);
  if (res.status === L1ToL2MessageStatus.FUNDS_DEPOSITED_ON_L2) {
    /** Message wasn't auto-redeemed; redeem it now: */
    const response = await l1ToL2Message.redeem();
    const receipt = await response.wait();
    console.log('3: receipt', receipt);
  } else if (res.status === L1ToL2MessageStatus.REDEEMED) {
    console.log('4: redeem success');
    /** Message succesfully redeeemed */
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
