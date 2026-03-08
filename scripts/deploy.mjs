import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import hre from "hardhat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORLD_CHAIN_RPC = "https://worldchain-mainnet.g.alchemy.com/public";
const WORLD_ID_ROUTER = "0x17B354dD2595411ff79041f930e491A4Df39A278";
const GROUP_ID = 1;
const USDC_ADDRESS = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

function computeExternalNullifierHash(appId, action) {
  const appIdHash = BigInt(ethers.keccak256(ethers.solidityPacked(["string"], [appId]))) >> 8n;
  const combined = ethers.solidityPacked(["uint256", "string"], [appIdHash, action]);
  return BigInt(ethers.keccak256(combined)) >> 8n;
}

function loadArtifact(contractPath) {
  const fullPath = path.join(__dirname, "../artifacts/contracts", contractPath);
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

async function deployContract(wallet, artifact, args = []) {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return await contract.getAddress();
}

async function verifyContract(address, constructorArgs = []) {
  try {
    console.log(`Verifying ${address}...`);
    await hre.run("verify:verify", { address, constructorArguments: constructorArgs });
    console.log(`  verified`);
  } catch (error) {
    console.error(`  verification failed: ${error.message}`);
  }
}

async function main() {
  const privateKey = process.env.PLATFORM_PRIVATE_KEY;
  if (!privateKey) {
    console.error("PLATFORM_PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  const appId = process.env.WORLD_APP_ID || "openlabor";
  const action = "register-agent";

  const provider = new ethers.JsonRpcProvider(WORLD_CHAIN_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Deploying to WorldChain Mainnet");
  console.log("From:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  const deployed = {};

  // WalletFactory
  console.log("\n--- OpenLaborWalletFactory ---");
  const factoryArtifact = loadArtifact("OpenLaborWalletFactory.sol/OpenLaborWalletFactory.json");
  deployed.factory = await deployContract(wallet, factoryArtifact);
  console.log("Deployed:", deployed.factory);

  // AgentRegistry
  console.log("\n--- OpenLaborAgentRegistry ---");
  const externalNullifierHash = computeExternalNullifierHash(appId, action);
  console.log("App:", appId, "| Action:", action);
  const registryArtifact = loadArtifact("OpenLaborAgentRegistry.sol/OpenLaborAgentRegistry.json");
  deployed.registry = await deployContract(wallet, registryArtifact, [WORLD_ID_ROUTER, GROUP_ID, externalNullifierHash]);
  console.log("Deployed:", deployed.registry);

  // Escrow
  console.log("\n--- OpenLaborEscrow ---");
  const escrowArtifact = loadArtifact("OpenLaborEscrow.sol/OpenLaborEscrow.json");
  deployed.escrow = await deployContract(wallet, escrowArtifact, [USDC_ADDRESS, PERMIT2_ADDRESS]);
  console.log("Deployed:", deployed.escrow);

  // Verify all
  console.log("\n--- Verifying ---");
  await verifyContract(deployed.factory);
  await verifyContract(deployed.registry, [WORLD_ID_ROUTER, GROUP_ID, externalNullifierHash.toString()]);
  await verifyContract(deployed.escrow, [USDC_ADDRESS, PERMIT2_ADDRESS]);

  console.log("\n--- Done ---");
  console.log("WALLET_FACTORY_ADDRESS=" + deployed.factory);
  console.log("AGENT_REGISTRY_ADDRESS=" + deployed.registry);
  console.log("ESCROW_CONTRACT_ADDRESS=" + deployed.escrow);
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
