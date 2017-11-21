import React, { Component } from 'react';
import logo from './blg.jpg';
import './App.css';
import Web3 from 'web3'

// Material UI
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import DropDownMenu from 'material-ui/DropDownMenu';
import MenuItem from 'material-ui/MenuItem';
import RaisedButton from 'material-ui/RaisedButton';
import TextField from 'material-ui/TextField';
import {
  Table,
  TableBody,
  TableHeader,
  TableHeaderColumn,
  TableRow,
  TableRowColumn,
} from 'material-ui/Table';

// Build Artifacts
import tokenArtiacts from './build/contracts/Token.json'
import exchangeArtiacts from './build/contracts/Exchange.json'

class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      ethBalance: 0,
      tokenBalance: 0,
      tokenSymbol: 0,
      tokenDecimals: 0,
      availableAccounts: [],
      defaultAccount: 0,
      mintUser: '',
      mintAmount: '',
      transferUser: '',
      transferAmount: '',
      bidAmount: 10,
      askAmount: 1,
      token: null, // token contract
      exchange: null, // exchange contract
      orderBook: [],
      selectedOrder: null
    }
  }

  componentDidMount() {
    if (window.web3)
        this.web3 = new Web3(window.web3.currentProvider)
    else
      this.web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"))

    // If connected load contracts
    if (this.web3.isConnected()) {
      // Retrieve available accounts
      this.web3.eth.getAccounts((err, accounts) => {
        const defaultAccount = this.web3.eth.accounts[0]

        // Append all available accounts
        for (let i = 0; i < accounts.length; i++) {
          this.setState({
            availableAccounts: this.state.availableAccounts.concat(
              <MenuItem value={i} key={accounts[i]} primaryText={accounts[i]} />
            )
          })
        }

        /************************
        * Set ETH balance below *
        ************************/
        this.web3.eth.getBalance(defaultAccount, (err, ethBalance) => {
          this.setState({ ethBalance })
        })

        // Get detected network and load the token contract
        this.web3.version.getNetwork(async (err, netId) => {
          // Create a reference object to the deployed token contract
          if (netId in tokenArtiacts.networks) {
            const tokenAddress = tokenArtiacts.networks[netId].address
            const token = this.web3.eth.contract(tokenArtiacts.abi).at(tokenAddress)
            this.setState({ token })
            console.log(token)

            // Bind to window for testing
            window.token = token

            // Exchange reference object
            const exchangeAddress = exchangeArtiacts.networks[netId].address
            const exchange = this.web3.eth.contract(exchangeArtiacts.abi).at(exchangeAddress)
            this.setState({ exchange })
            console.log(exchange)

            // Bind to window for testing
            window.exchange = exchange

            /**************************
            * Set token balance below *
            **************************/
            token.balanceOf(defaultAccount, (err, tokenBalance) => {
              this.setState({ tokenBalance })
            })

            /*************************
            * Set token sybmol below *
            *************************/
            token.symbol((err, tokenSymbol) => {
              this.setState({ tokenSymbol })
            })

            /*********************************
            * Set token decimal places below *
            *********************************/
            token.decimals((err, tokenDecimals) => {
              this.setState({ tokenDecimals })
            })

            /********************************
            * Call loadEventListeners below *
            ********************************/
            this.loadEventListeners()

            this.loadOrderBook()
          } else {
            console.error('Token has not been deployed to the detected network.')
          }
        })
      })
    } else {
      console.error('Web3 is not connected.')
    }
  }

  /**
   * Add a new order to the oder book
   * @param {Object} order The log object emitted by the exchange.
   */
  addOrder(order) {
    // Confirm this order is not already present
    for (let i = 0; i < this.state.orderBook.length; i++) {
      if (this.state.orderBook[i].key === order.id) {
        return
      }
    }
    // NOTE eth only supported as ask token
    // TODO support multiple tokens and pairings
    this.setState({
      orderBook: [
        <TableRow key={order.id} selected={this.setState({ selectedOrder: order.id })}>
          <TableRowColumn>{order.maker}</TableRowColumn>
          <TableRowColumn>{this.state.tokenSymbol}</TableRowColumn>
          <TableRowColumn>{order.bidAmount.toNumber() / 10**this.state.tokenDecimals}</TableRowColumn>
          <TableRowColumn>ETH</TableRowColumn>
          <TableRowColumn>{order.askAmount.toNumber() / 10**18 }</TableRowColumn>
        </TableRow>
      ].concat(this.state.orderBook)
    })
  }

  /**
   * Execute a selected order.
   * @param {String} orderId The 32 byte hash of the order params representing its unique id.
   */
  executeOrder(orderId) {
    // Get the ask amount of the order, ether to send along with the tx
    this.state.exchange.orderBook_(orderId, (err, order) => {
      this.state.exchange.executeOrder(orderId, {
        from: this.web3.eth.accounts[this.state.defaultAccount],
        gas: 4e6,
        value: order[4] // askAmount of maker order
      }, (err, res) => {
        if (err) console.error(err)
        else console.log(res)
      })
    })
  }

  /**
   * Load the accounts token and ether balances.
   * @param  {Address} account The user's ether address.
   */
  loadAccountBalances(account) {
    if (this.state.token) {
      /**************************
      * Set token balance below *
      **************************/
      this.state.token.balanceOf(account, (err, tokenBalance) => {
        this.setState({ tokenBalance })
      })

      /**************************
      * Set ETH balance below *
      **************************/
      this.web3.eth.getBalance(account, (err, ethBalance) => {
        this.setState({ ethBalance })
      })
    }
  }

  /**
   * Create listeners for all events.
   */
  loadEventListeners() {
    /**********************************
    * Watch tokens minted event below *
    **********************************/
    this.state.token.LogTokensMinted({ fromBlock: 'latest', toBlock: 'latest' })
    .watch((err, res) => {
      console.log(`Tokens Minted! TxHash: https://kovan.etherscan.io/tx/${res.transactionHash}`)
      this.loadAccountBalances(this.web3.eth.accounts[this.state.defaultAccount])
    })

    /************************************
    * Watch tokens transfer event below *
    ************************************/
    this.state.token.Transfer({ fromBlock: 'latest', toBlock: 'latest' })
    .watch((err, res) => {
      console.log(`Tokens Transferred! TxHash: https://kovan.etherscan.io/tx/${res.transactionHash}`)
      this.loadAccountBalances(this.web3.eth.accounts[this.state.defaultAccount])
    })

    /**********************************
    * Watch error emitted event below *
    **********************************/
    this.state.token.LogErrorString({ fromBlock: 'latest', toBlock: 'latest' })
    .watch((err, res) => {
      console.error(res.args.errorString)
    })

    this.state.exchange.LogOrderSubmitted({ fromBlock: 'latest', toBlock: 'latest' })
    .watch((err, res) => {
      console.log(`Order submitted! TxHash: https://kovan.etherscan.io/tx/${res.transactionHash}`)
      this.addOrder(res.args)
      this.loadAccountBalances(this.web3.eth.accounts[this.state.defaultAccount])
    })

    this.state.exchange.LogOrderExecuted({ fromBlock: 'latest', toBlock: 'latest' })
    .watch((err, res) => {
      console.log(`Order Executed! TxHash: https://kovan.etherscan.io/tx/${res.transactionHash}`)
      this.removeOrder(res.args.id)
      this.loadAccountBalances(this.web3.eth.accounts[this.state.defaultAccount])
    })
  }

  /**
   * Load all orders into the order book via exchange events
   */
  loadOrderBook() {
    this.state.exchange.LogOrderSubmitted({}, {fromBlock: 0, toBlock: 'latest'})
    .get((err, orders) => {
      for (let i = 0; i < orders.length; i++) {
        // confirm the order still exists then append to table
        this.state.exchange.orderBook_(orders[i].args.id, (err, order) => {
          if (order[4].toNumber() !== 0)
            this.addOrder(orders[i].args)
        })
      }
    })
  }

  /**
   * Mint new tokens to a user.
   * @param  {Address} user   The EOA to mint to.
   * @param  {Number} amount Amount of tokens to mint.
   */
  mint(user, amount) {
    // Confirm user seems to be a valid address
    if (user.length === 42 && amount > 0) {
      /*********************
      * Execute mint below *
      *********************/
      this.state.token.mint(
        user,
        amount*10**this.state.tokenDecimals, // Convert to correct decimal places
        { from: this.web3.eth.accounts[this.state.defaultAccount] },
        (err, res) => {
          if (err) console.error(err)
          else console.log(res)
        }
      )
    }
  }

  /**
   * Remove an order from the orderBook.
   * @param {String} orderId The 32 byte hash of the order params representing its unique id.
   */
  removeOrder(orderId) {
    for (let i = 0; i < this.state.orderBook.length; i++) {
      if (this.state.orderBook[i].key === orderId) {
        // Slice this index from the current order book and update
        let updatedOrderBook = this.state.orderBook.slice();
        updatedOrderBook.splice(i, 1);
        this.setState({ orderBook: updatedOrderBook })
        break
      }
    }
  }

  /**
   * Submit a new order to the order book.
   */
  submitOrder() {
    // First give the exchange the appropriate allowance
    // NOTE if the submitOrder fails the exchange still has the allowance
    this.state.token.approve(
      this.state.exchange.address,
      this.state.bidAmount*10**this.state.tokenDecimals, {
        from: this.web3.eth.accounts[this.state.defaultAccount],
        gas: 1e6
      }, (err, res) => {
        if (err) console.error(err)
        else console.log(res)
        // Submit the order to the exchange
        this.state.exchange.submitOrder(
          this.state.token.address,
          this.state.bidAmount*10**this.state.tokenDecimals,
          '0', // Ether address
          this.state.askAmount*10**18 /* harcoded ETH decimal places */, {
            from: this.web3.eth.accounts[this.state.defaultAccount],
            gas: 1e6
          }, (err, res) => {
            if (err) console.error(err)
            else console.log(res)
          }
        )
    })
  }

  /**
   * Mint new tokens to a user.
   * @param  {Address} user   The EOA to transfer to.
   * @param  {Number} amount Amount of tokens to transfer.
   */
  transfer(user, amount) {
    // Confirm user seems to be a valid address
    if (user.length === 42 && amount > 0) {
      /*******************************
      * Execute token transfer below *
      *******************************/
      this.state.token.transfer(
        user,
        amount*10**this.state.tokenDecimals, // Convert to correct decimal places
        { from: this.web3.eth.accounts[this.state.defaultAccount] },
        (err, res) => {
          if (err) console.error(err)
          else console.log(res)
        }
      )
    }
  }

  /**
   * When a new account in selected in the available accounts drop down.
   */
  handleDropDownChange = (e, index, defaultAccount) => {
    this.setState({ defaultAccount })
    this.loadAccountBalances(this.state.availableAccounts[index].key)
  }

  render() {
    let component
    if (window.location.hash === '#exchange') {
      component = <div>
        <h3>Active Account</h3>
        <DropDownMenu maxHeight={300} width={500} value={this.state.defaultAccount} onChange={this.handleDropDownChange} >
          {this.state.availableAccounts}
        </DropDownMenu>
        <h3>Account Balances</h3>
        <p className="App-intro">{this.state.ethBalance / 1e18} ETH</p>
        <p className="App-intro"> {this.state.tokenBalance / 10**this.state.tokenDecimals} {this.state.tokenSymbol}</p>
        <br />
        <h3>Submit an Order!</h3>
        <p>The default exchange supports only the pairing of {this.state.tokenSymbol} / ETH</p>
        <TextField floatingLabelText="Bid" style={{width: 75}} value={this.state.tokenSymbol} />
        <TextField floatingLabelText="Amount" style={{width: 75}} value={this.state.bidAmount}
          onChange={(e, bidAmount) => this.setState({ bidAmount })}
        />
        <TextField floatingLabelText="Ask" style={{width: 75}} value="ETH" />
        <TextField floatingLabelText="Amount" style={{width: 75}} value={this.state.askAmount}
          onChange={(e, askAmount) => this.setState({ askAmount })}
        />
        <br />
        <RaisedButton label="Submit" labelPosition="after" style={{width: 300}} primary={true} onClick={() => this.submitOrder()}/>
        <br />
        <br />
        <h3>Order Book</h3>
        <p>Select an order to execute!</p>
        <RaisedButton label="Execute Order" labelPosition="after" style={{width: 500}} primary={true}
          onClick={() => this.executeOrder(this.state.selectedOrder)}
        />
        <Table style={{ maxHeight: 500, overflow: "auto" }} fixedHeader={true} multiSelectable={false} >
          <TableHeader>
            <TableRow>
              <TableHeaderColumn>Maker</TableHeaderColumn>
              <TableHeaderColumn>Bid Token</TableHeaderColumn>
              <TableHeaderColumn>Bid Amount</TableHeaderColumn>
              <TableHeaderColumn>Ask Token</TableHeaderColumn>
              <TableHeaderColumn>Ask Amount</TableHeaderColumn>
            </TableRow>
          </TableHeader>
          <TableBody> { this.state.orderBook } </TableBody>
        </Table>
      </div>
    } else {
      component = <div>
        <h3>Active Account</h3>
        <DropDownMenu maxHeight={300} width={500} value={this.state.defaultAccount} onChange={this.handleDropDownChange}>
          {this.state.availableAccounts}
        </DropDownMenu>
        <h3>Balances</h3>
        <p className="App-intro">{this.state.ethBalance / 1e18} ETH</p>
        <p className="App-intro"> {this.state.tokenBalance / 10**this.state.tokenDecimals} {this.state.tokenSymbol}</p>
        <br />
        <div>
          <h3>Mint Tokens</h3>
          <TextField floatingLabelText="User to mint tokens to." style={{width: 400}} value={this.state.mintUser}
            onChange={(e, mintUser) => {this.setState({ mintUser })}}
          />
          <TextField floatingLabelText="Amount." style={{width: 100}} value={this.state.mintAmount}
            onChange={(e, mintAmount) => {this.setState({ mintAmount })}}
          />
          <RaisedButton label="Mint" labelPosition="before" primary={true}
            onClick={() => this.mint(this.state.mintUser, this.state.mintAmount)}
          />
        </div>
        <br />
        <div>
          <h3>Transfer Tokens</h3>
          <TextField floatingLabelText="User to transfer tokens to." style={{width: 400}} value={this.state.transferUser}
            onChange={(e, transferUser) => { this.setState({ transferUser }) }}
          />
          <TextField floatingLabelText="Amount." style={{width: 100}} value={this.state.amount}
            onChange={(e, transferAmount) => { this.setState({ transferAmount })}}
          />
          <RaisedButton label="Transfer" labelPosition="before" primary={true}
            onClick={() => this.transfer(this.state.transferUser, this.state.transferAmount)}
          />
        </div>
      </div>
    }

    return (
      <MuiThemeProvider>
        <div className="App">
          <header className="App-header">
            <img src={logo} alt="logo" style={{height: '150px', width: '350px'}}/>
          </header>
          {component}
        </div>
      </MuiThemeProvider>
    );
  }
}

export default App;
