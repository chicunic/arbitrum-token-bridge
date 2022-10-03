import * as dotenv from 'dotenv';
import { run } from 'hardhat';
import { JsonStorage } from './utils/jsonStorage';
dotenv.config();

async function main(): Promise<void> {
  const deployed = new JsonStorage('../deployed.json');

  const contracts = [
    {
      name: 'ProxyAdmin',
      address: deployed.get('l1ProxyAdmin'),
      contract: '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
      constructorArguments: [],
    },
    {
      name: 'GatewayRouter Proxy',
      address: deployed.get('l1GatewayRouter'),
      contract: '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
      constructorArguments: [deployed.get('l1GatewayRouterLogic'), deployed.get('l1ProxyAdmin'), '0x'],
    },
    {
      name: 'CustomGateway Logic',
      address: deployed.get('l1CustomGatewayLogic'),
      contract: 'contracts/ethereum/gateway/L1CustomGateway.sol:L1CustomGateway',
      constructorArguments: [],
    },
    {
      name: 'CustomGateway Proxy',
      address: deployed.get('l1CustomGateway'),
      contract: '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
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
      console.log(`6-1: L1 ${name} verified at ${address as string}`);
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
