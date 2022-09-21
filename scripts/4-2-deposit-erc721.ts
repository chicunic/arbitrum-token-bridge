import * as dotenv from 'dotenv';
import * as _ from 'lodash';
import { L1ToL2MessageStatus, getL2Network } from '@arbitrum/sdk';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { Erc721Bridger } from '../src/assetBridger/erc721Bridger';
import { JsonStorage } from './utils/jsonStorage';
import { L1ERC721TokenFactory, L2ERC721TokenFactory } from './utils/contractFactories';
import { parseWallets } from './utils/parseWallets';
dotenv.config();

const tokenIds = [1, 2, 3, 4, 5].map((id) => BigNumber.from(id));
const amount = BigNumber.from(tokenIds.length);

async function main(): Promise<void> {
  const { l1Provider, l2Provider, l1Wallet, l2Wallet } = parseWallets();
  const deployed = new JsonStorage('../deployed.json');
  if (deployed.get('l1ProxyAdmin') == null || deployed.get('l2ProxyAdmin') == null) {
    throw Error('ProxyAdmin not deployed');
  }
  if (deployed.get('l1CustomGateway') == null || deployed.get('l2CustomGateway') == null) {
    throw Error('CustomGateway not deployed');
  }
  if (deployed.get('l1ERC721Token') == null || deployed.get('l2ERC721Token') == null) {
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
  const bridge = new Erc721Bridger(l2Network);

  const l1token = (await ethers.getContractFactory(L1ERC721TokenFactory))
    .attach(deployed.get('l1ERC721Token'))
    .connect(l1Wallet);
  const l2token = (await ethers.getContractFactory(L2ERC721TokenFactory))
    .attach(deployed.get('l2ERC721Token'))
    .connect(l2Wallet);

  // pre check
  const expectedL1GatewayAddress = await bridge.getL1GatewayAddress(deployed.get('l1ERC721Token'), l1Provider);
  const initialBridgeTokenBalance: BigNumber = await l1token.balanceOf(expectedL1GatewayAddress);
  console.log('4-1: L1 Bridge balance', initialBridgeTokenBalance.toString());

  // mint
  {
    const balance: BigNumber = await l1token.balanceOf(l1Wallet.address);
    if (BigNumber.from(balance).lt(amount)) {
      const mintTx = await l1token['mint(address,uint256[])'](l1Wallet.address, tokenIds);
      await mintTx.wait();
      const newBalance: BigNumber = await l1token.balanceOf(l1Wallet.address);
      console.log('4-2: L1 ERC721 balance', newBalance.toString());
    } else {
      console.log('4-2: L1 ERC721 balance', balance.toString());
    }
  }

  // approve
  {
    const allowance: boolean = await l1token.isApprovedForAll(l1Wallet.address, deployed.get('l1CustomGateway'));
    if (!allowance) {
      const approveTx = await bridge.approveToken({
        l1Signer: l1Wallet,
        erc721L1Address: deployed.get('l1ERC721Token'),
      });
      await approveTx.wait();
      console.log('4-3: L1 ERC721 approved');
    } else {
      console.log('4-3: L1 ERC721 already approved');
    }
  }

  // deposit
  const depositTx = await bridge.deposit({
    amount,
    erc721L1Address: deployed.get('l1ERC721Token'),
    l1Signer: l1Wallet,
    l2Provider,
    tokenIds,
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
  console.log('4-7: L2 ERC721 balance', finalBalance.toString());

  console.log('Done.');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
