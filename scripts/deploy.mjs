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

async function verifyContract(address, constructorArgs = []) {
  try {
    console.log(`Verifying contract at ${address}...`);
    await hre.run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(`✓ Contract at ${address} verified successfully`);
    return true;
  } catch (error) {
    console.error(`✗ Verification failed for ${address}:`, error.message);
    return false;
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
  console.log("From address:", wallet.address);

  const network = await provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId.toString());

  const balance = await provider.getBalance(wallet.address);
  console.log("ETH balance:", ethers.formatEther(balance));

  const deployedAddresses = {};

  // Deploy OpenLaborWalletFactory
  console.log("\n=== Deploying OpenLaborWalletFactory ===");
  const factoryArtifacts = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/OpenLaborWalletFactory.sol/OpenLaborWalletFactory.json"), "utf-8"));
  const factoryFactory = new ethers.ContractFactory(factoryArtifacts.abi, factoryArtifacts.bytecode.object, wallet);
  const factoryContract = await factoryFactory.deploy();
  await factoryContract.waitForDeployment();
  const factoryAddress = await factoryContract.getAddress();
  console.log("OpenLaborWalletFactory deployed to:", factoryAddress);
  deployedAddresses.factory = factoryAddress;

  // Deploy OpenLaborAgentRegistry
  console.log("\n=== Deploying OpenLaborAgentRegistry ===");
  const externalNullifierHash = computeExternalNullifierHash(appId, action);
  console.log("App ID:", appId);
  console.log("Action:", action);
  console.log("External Nullifier Hash:", externalNullifierHash.toString());

  const registryArtifacts = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/OpenLaborAgentRegistry.sol/OpenLaborAgentRegistry.json"), "utf-8"));
  const registryFactory = new ethers.ContractFactory(registryArtifacts.abi, registryArtifacts.bytecode.object, wallet);
  const registryContract = await registryFactory.deploy(WORLD_ID_ROUTER, GROUP_ID, externalNullifierHash);
  await registryContract.waitForDeployment();
  const registryAddress = await registryContract.getAddress();
  console.log("OpenLaborAgentRegistry deployed to:", registryAddress);
  deployedAddresses.registry = registryAddress;

  // Deploy OpenLaborEscrow (if available)
  console.log("\n=== Deploying OpenLaborEscrow ===");
  const escrowAbiPath = path.join(__dirname, "../server/contracts/OpenLaborEscrowABI.json");
  const escrowBytecodePath = path.join(__dirname, "../server/contracts/OpenLaborEscrowBytecode.json");
  
  if (fs.existsSync(escrowAbiPath) && fs.existsSync(escrowBytecodePath)) {
    const escrowAbi = JSON.parse(fs.readFileSync(escrowAbiPath, "utf-8"));
    const { bytecode } = JSON.parse(fs.readFileSync(escrowBytecodePath, "utf-8"));
    
    const escrowFactory = new ethers.ContractFactory(escrowAbi, bytecode, wallet);
    const escrowContract = await escrowFactory.deploy(USDC_ADDRESS, PERMIT2_ADDRESS);
    await escrowContract.waitForDeployment();
    const escrowAddress = await escrowContract.getAddress();
    console.log("OpenLaborEscrow deployed to:", escrowAddress);
    deployedAddresses.escrow = escrowAddress;
  } else {
    console.log("OpenLaborEscrow not found - skipping (compile escrow contract first)");
  }

  // Verify contracts
  console.log("\n=== Verifying Contracts ===");
  
  // Verify OpenLaborWalletFactory
  await verifyContract(deployedAddresses.factory);

  // Verify OpenLaborAgentRegistry
  await verifyContract(deployedAddresses.registry, [WORLD_ID_ROUTER, GROUP_ID, externalNullifierHash.toString()]);

  // Verify OpenLaborEscrow if deployed
  if (deployedAddresses.escrow) {
    await verifyContract(deployedAddresses.escrow, [USDC_ADDRESS, PERMIT2_ADDRESS]);
  }

  console.log("\n=== Deployment Complete ===");
  console.log("\nContract Addresses:");
  console.log("  OpenLaborWalletFactory:", deployedAddresses.factory);
  console.log("  OpenLaborAgentRegistry:", deployedAddresses.registry);
  if (deployedAddresses.escrow) {
    console.log("  OpenLaborEscrow:", deployedAddresses.escrow);
  }

  console.log("\nWorldScan URLs:");
  console.log("  OpenLaborWalletFactory: https://worldscan.io/address/" + deployedAddresses.factory);
  console.log("  OpenLaborAgentRegistry: https://worldscan.io/address/" + deployedAddresses.registry);
  if (deployedAddresses.escrow) {
    console.log("  OpenLaborEscrow: https://worldscan.io/address/" + deployedAddresses.escrow);
  }

  console.log("\nEnvironment Variables:");
  console.log("WALLET_FACTORY_ADDRESS=" + deployedAddresses.factory);
  console.log("AGENT_REGISTRY_ADDRESS=" + deployedAddresses.registry);
  if (deployedAddresses.escrow) {
    console.log("ESCROW_CONTRACT_ADDRESS=" + deployedAddresses.escrow);
  }
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exit(1);
});
