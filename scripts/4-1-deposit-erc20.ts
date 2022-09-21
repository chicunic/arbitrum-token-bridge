import * as dotenv from 'dotenv';
import * as _ from 'lodash';
import { Erc20Bridger, L1ToL2MessageStatus, getL2Network } from '@arbitrum/sdk';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';
import { JsonStorage } from './utils/jsonStorage';
import { L1ERC20TokenFactory, L2ERC20TokenFactory } from './utils/contractFactories';
import { parseWallets } from './utils/parseWallets';
dotenv.config();

const amount = utils.parseEther('1');

async function main(): Promise<void> {
  const { l1Provider, l2Provider, l1Wallet, l2Wallet } = parseWallets();
  const deployed = new JsonStorage('../deployed.json');
  if (deployed.get('l1ProxyAdmin') == null || deployed.get('l2ProxyAdmin') == null) {
    throw Error('ProxyAdmin not deployed');
  }
  if (deployed.get('l1CustomGateway') == null || deployed.get('l2CustomGateway') == null) {
    throw Error('CustomGateway not deployed');
  }
  if (deployed.get('l1ERC20Token') == null || deployed.get('l2ERC20Token') == null) {
    throw Error('Token not deployed');
  }

  const customTokenBridge = {
    l1CustomGateway: deployed.get('l1CustomGateway'),
    l2CustomGateway: deployed.get('l2CustomGateway'),
  };

  const defaultL2Network = await getL2Network(l2Provider);
  const l2Network = {
    ...defaultL2Network,
    tokenBridge: _.merge(defaultL2Network.tokenBridge, customTokenBridge),
  };
  const bridge = new Erc20Bridger(l2Network);

  const l1token = (await ethers.getContractFactory(L1ERC20TokenFactory))
    .attach(deployed.get('l1ERC20Token'))
    .connect(l1Wallet);
  const l2token = (await ethers.getContractFactory(L2ERC20TokenFactory))
    .attach(deployed.get('l2ERC20Token'))
    .connect(l2Wallet);

  // pre check
  const expectedL1GatewayAddress = await bridge.getL1GatewayAddress(deployed.get('l1ERC20Token'), l1Provider);
  const initialBridgeTokenBalance: BigNumber = await l1token.balanceOf(expectedL1GatewayAddress);
  console.log('4-1: L1 Bridge balance', initialBridgeTokenBalance.toString());

  // mint
  {
    const balance: BigNumber = await l1token.balanceOf(l1Wallet.address);
    if (BigNumber.from(balance).lt(amount)) {
      const mintTx = await l1token.mint(l1Wallet.address, amount);
      await mintTx.wait();
      const newBalance: BigNumber = await l1token.balanceOf(l1Wallet.address);
      console.log('4-2: L1 ERC20 balance', newBalance.toString());
    } else {
      console.log('4-2: L1 ERC20 balance', balance.toString());
    }
  }

  // approve
  {
    const allowance = await l1token.allowance(l1Wallet.address, deployed.get('l1CustomGateway'));
    if (BigNumber.from(allowance).lt(amount)) {
      const approveTx = await bridge.approveToken({
        l1Signer: l1Wallet,
        erc20L1Address: deployed.get('l1ERC20Token'),
      });
      await approveTx.wait();
      console.log('4-3: L1 ERC20 approved');
    } else {
      console.log('4-3: L1 ERC20 already approved');
    }
  }

  // deposit
  const depositTx = await bridge.deposit({
    amount,
    erc20L1Address: deployed.get('l1ERC20Token'),
    l1Signer: l1Wallet,
    l2Provider,
  });
  const depositRec = await depositTx.wait();
  console.log('4-4: L1 ER721 deposited');
  const l2Result = await depositRec.waitForL2(l2Provider);
  l2Result.complete
    ? console.log(`4-5: L2 message successful: status: ${L1ToL2MessageStatus[l2Result.status]}`)
    : console.log(`4-5: L2 message failed: status ${L1ToL2MessageStatus[l2Result.status]}`);

  // post check
  const finalBridgeTokenBalance: BigNumber = await l1token.balanceOf(expectedL1GatewayAddress);
  console.log('4-6: Final L1 Bridge balance', finalBridgeTokenBalance.toString());

  const finalBalance: BigNumber = await l2token.balanceOf(l2Wallet.address);
  console.log('4-7: L2 ERC20 balance', finalBalance.toString());

  console.log('Done.');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
