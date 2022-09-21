import * as dotenv from 'dotenv';
dotenv.config();

async function main(): Promise<void> {
  console.log('Done.');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
