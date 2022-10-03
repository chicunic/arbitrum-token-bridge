import * as dotenv from 'dotenv';
import { run } from 'hardhat';
import { JsonStorage } from './utils/jsonStorage';
dotenv.config();

async function main(): Promise<void> {
  const deployed = new JsonStorage('../deployed.json');

  const contracts = [
    {
      name: 'ProxyAdmin',
      address: deployed.get('l2ProxyAdmin'),
      contract: '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
      constructorArguments: [],
    },
    {
      name: 'GatewayRouter Proxy',
      address: deployed.get('l2GatewayRouter'),
      contract: '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
      constructorArguments: [deployed.get('l2GatewayRouterLogic'), deployed.get('l2ProxyAdmin'), '0x'],
    },
    {
      name: 'CustomGateway Logic',
      address: deployed.get('l2CustomGatewayLogic'),
      contract: 'contracts/arbitrum/gateway/L2CustomGateway.sol:L2CustomGateway',
      constructorArguments: [],
    },
    {
      name: 'CustomGateway Proxy',
      address: deployed.get('l2CustomGateway'),
      contract: '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
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
