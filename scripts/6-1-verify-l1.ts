import * as dotenv from 'dotenv';
import { run } from 'hardhat';
import { JsonStorage } from './utils/jsonStorage';
import {
  ProxyAdminFactory,
  TransparentUpgradeableProxyFactory,
  L1CustomGatewayFactory,
} from './utils/contractFactories';
dotenv.config();

async function main(): Promise<void> {
  const deployed = new JsonStorage('../deployed.json');

  const contracts = [
    {
      name: 'ProxyAdmin',
      address: deployed.get('l1ProxyAdmin'),
      contract: ProxyAdminFactory,
      constructorArguments: [],
    },
    {
      name: 'GatewayRouter Proxy',
      address: deployed.get('l1GatewayRouter'),
      contract: TransparentUpgradeableProxyFactory,
      constructorArguments: [deployed.get('l1GatewayRouterLogic'), deployed.get('l1ProxyAdmin'), '0x'],
    },
    {
      name: 'CustomGateway Logic',
      address: deployed.get('l1CustomGatewayLogic'),
      contract: L1CustomGatewayFactory,
      constructorArguments: [],
    },
    {
      name: 'CustomGateway Proxy',
      address: deployed.get('l1CustomGateway'),
      contract: TransparentUpgradeableProxyFactory,
      constructorArguments: [deployed.get('l1CustomGatewayLogic'), deployed.get('l1ProxyAdmin'), '0x'],
    },
  ];

  for (const { name, address, contract, constructorArguments } of contracts) {
    try {
      await run('verify:verify', {
        address,
        contract,
        constructorArguments,
      });
      console.log(`7-1: L1 ${name} verified at deployed.get('l1ProxyAdmin`);
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
