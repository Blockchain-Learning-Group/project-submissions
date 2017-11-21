const Token = artifacts.require("./Token.sol");
const Exchange = artifacts.require("./Exchange.sol");
const owner = web3.eth.accounts[0]

module.exports = deployer => {
  deployer.deploy(Token, { from: owner, gas: 4e6 })
  deployer.deploy(Exchange, { from: owner, gas: 4e6 })
}
