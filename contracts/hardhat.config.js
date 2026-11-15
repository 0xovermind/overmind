require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    rhTestnet: {
      url: process.env.RH_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
