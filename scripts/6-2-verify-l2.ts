import * as dotenv from 'dotenv';
import { run } from 'hardhat';
import { JsonStorage } from './utils/jsonStorage';
import {
  ProxyAdminFactory,
  TransparentUpgradeableProxyFactory,
  L2CustomGatewayFactory,
} from './utils/contractFactories';
dotenv.config();

async function main(): Promise<void> {
  const deployed = new JsonStorage('../deployed.json');

  const contracts = [
    {
      name: 'ProxyAdmin',
      address: deployed.get('l2ProxyAdmin'),
      contract: ProxyAdminFactory,
      constructorArguments: [],
    },
    {
      name: 'GatewayRouter Proxy',
      address: deployed.get('l2GatewayRouter'),
      contract: TransparentUpgradeableProxyFactory,
      constructorArguments: [deployed.get('l2GatewayRouterLogic'), deployed.get('l2ProxyAdmin'), '0x'],
    },
    {
      name: 'CustomGateway Logic',
      address: deployed.get('l2CustomGatewayLogic'),
      contract: L2CustomGatewayFactory,
      constructorArguments: [],
    },
    {
      name: 'CustomGateway Proxy',
      address: deployed.get('l2CustomGateway'),
      contract: TransparentUpgradeableProxyFactory,
      constructorArguments: [deployed.get('l2CustomGatewayLogic'), deployed.get('l2ProxyAdmin'), '0x'],
    },
  ];

  for (const { name, address, contract, constructorArguments } of contracts) {
    try {
      await run('verify:verify', {
        address,
        contract,
        constructorArguments,
      });
      console.log(`6-2: L2 ${name} verified at ${address as string}`);
    } catch (e: any) {
      console.error(name, e.message);
    }
  }

  console.log('Done.');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
