import * as dotenv from 'dotenv';
import { getL2Network } from '@arbitrum/sdk';
import { L1GatewayRouter__factory } from '@arbitrum/sdk/dist/lib/abi/factories/L1GatewayRouter__factory';
import { L2GatewayRouter__factory } from '@arbitrum/sdk/dist/lib/abi/factories/L2GatewayRouter__factory';
import { JsonStorage } from './utils/jsonStorage';
import { parseWallets } from './utils/parseWallets';
import { L1CustomGateway__factory, L2CustomGateway__factory } from '../typechain-types';
dotenv.config();

async function main(): Promise<void> {
  const { l1Provider, l2Provider } = parseWallets();
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

  const defaultL2Network = await getL2Network(l2Provider);
  const l1CustomGateway = L1CustomGateway__factory.connect(deployed.get('l1CustomGateway'), l1Provider);
  const l2CustomGateway = L2CustomGateway__factory.connect(deployed.get('l2CustomGateway'), l2Provider);
  const l1GatewayRouter = L1GatewayRouter__factory.connect(defaultL2Network.tokenBridge.l1GatewayRouter, l1Provider);
  const l2GatewayRouter = L2GatewayRouter__factory.connect(defaultL2Network.tokenBridge.l2GatewayRouter, l2Provider);

  let checkpass = true;
  // check CustomGateway
  {
    const l1token = deployed.get('l1ERC20Token');
    const l2token = deployed.get('l2ERC20Token');
    const l2tokenC1 = await l1CustomGateway.calculateL2TokenAddress(l1token);
    const l2tokenC2 = await l2CustomGateway.calculateL2TokenAddress(l1token);
    const l2tokenG1 = await l1GatewayRouter.calculateL2TokenAddress(l1token);
    const l2tokenG2 = await l2GatewayRouter.calculateL2TokenAddress(l1token);
    if (l2tokenC1 !== l2token) checkpass = false;
    if (l2tokenC2 !== l2token) checkpass = false;
    if (l2tokenG1 !== l2token) checkpass = false;
    if (l2tokenG2 !== l2token) checkpass = false;
    console.log('3-1: L2 Token                          ', l2token);
    console.log('     L2 Token (L1CustomGateway)        ', l2tokenC1);
    console.log('     L2 Token (L2CustomGateway}        ', l2tokenC2);
    console.log('     L2 Token (L1GatewayRouter)        ', l2tokenG1);
    console.log('     L2 Token (L2GatewayRouter)        ', l2tokenG2);
  }

  // check GatwayRouter
  {
    const l1gateway = deployed.get('l1CustomGateway');
    const l2gateway = deployed.get('l2CustomGateway');
    const l1token = deployed.get('l1ERC20Token');
    const l1gatewayG1 = await l1GatewayRouter.getGateway(l1token);
    if (l1gatewayG1 !== l1gateway) checkpass = false;
    console.log('3-2: L1 CustomGateway                  ', l1gateway);
    console.log('     L1 CustomGateway (L1GatewayRouter)', l1gatewayG1);

    const l2gatewayG2 = await l2GatewayRouter.getGateway(l1token);
    if (l2gatewayG2 !== l2gateway) checkpass = false;
    console.log('3-3: L2 CustomGateway                  ', l2gateway);
    console.log('     L2 CustomGateway (L2GatewayRouter)', l2gatewayG2);
  }

  if (checkpass) {
    console.log('Done.');
  } else {
    console.log('Please check later.');
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
