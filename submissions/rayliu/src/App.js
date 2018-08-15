import React, { Component } from 'react';
import { BrowserRouter, Route, Link } from 'react-router-dom'
import logo from './blg.jpg';
import './App.css';
// Import the web3 library
import Web3 from 'web3'

// Material UI
import MenuItem from 'material-ui/MenuItem';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import DropDownMenu from 'material-ui/DropDownMenu';
import RaisedButton from 'material-ui/RaisedButton';
import TextField from 'material-ui/TextField';
import { Table, TableBody, TableHeader, TableHeaderColumn, TableRow, TableRowColumn } from 'material-ui/Table';

// Import build Artifacts
import tokenArtifacts from './build/contracts/Token.json'
import exchangeArtifacts from './build/contracts/Exchange.json'

class App extends Component {
  constructor(props) {
    super(props)
    this.state = {
      token: null, // token contract
      availableAccounts: [],
      defaultAccount: 0,
      tokenSymbol: 0,
      rate: 1,
      tokenBalance: 0,
      ethBalance: 0,
      amount: 0,
      transferAmount: '',
      transferUser: 0,
      exchange: null,
      askAmount: 1,
      bidAmount: 10,
      orderBook: [],
      selectedOrder: null
    }
  }

  componentDidMount() {
    // Create a web3 connection
    this.web3 = new Web3(new Web3.providers.HttpProvider("http://192.168.99.102:8545"));
    if (this.web3.isConnected()) {
      this.web3.version.getNetwork(async (err, netId) => {
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
          // Create a reference object to the deployed token contract
          if (netId in tokenArtifacts.networks) {
            const tokenAddress = tokenArtifacts.networks[netId].address

            const token = this.web3.eth.contract(tokenArtifacts.abi).at(tokenAddress)
            this.setState({ token })
            console.log(token)

            const exchangeAddress = exchangeArtifacts.networks[netId].address
            const exchange = this.web3.eth.contract(exchangeArtifacts.abi).at(exchangeAddress)
            this.setState({ exchange })
            console.log(exchange)

            // Set token symbol below
            token.symbol((err, tokenSymbol) => {
              this.setState({ tokenSymbol })
            })

            // Set wei / token rate below
            token.rate((err, rate) => {
              this.setState({ rate: rate.toNumber() })
            })

            this.loadOrderBook()
            this.loadAccountBalances(defaultAccount)
            this.loadEventListeners()
          }


        })


      })
    }
  }

  /**
   * Load the accounts token and ether balances.
   * @param  {Address} account The user's ether address.
   */
  loadAccountBalances(account) {
    if (this.state.token) {
      // Set token balance below
      this.state.token.balanceOf(account, (err, balance) => {
        this.setState({ tokenBalance: balance.toNumber() })
      })
    }

    // Set ETH balance below
    this.web3.eth.getBalance(account, (err, ethBalance) => {
      this.setState({ ethBalance })
    })

  }

  // Create listeners for all events.
  loadEventListeners() {
    // Watch tokens transfer event below
    this.state.token.Transfer({ fromBlock: 'latest', toBlock: 'latest' })
      .watch((err, res) => {
        console.log(`Tokens Transferred! TxHash: ${res.transactionHash} \n ${JSON.stringify(res.args)}`)
        this.loadAccountBalances(this.web3.eth.accounts[this.state.defaultAccount])
      })

    this.state.exchange.OrderSubmitted({ fromBlock: 'latest', toBlock: 'latest' })
      .watch((err, res) => {
        console.log(`Order Submitted! TxHash: ${res.transactionHash} \n ${JSON.stringify(res.args)}`)
        this.loadAccountBalances(this.web3.eth.accounts[this.state.defaultAccount])
        this.addOrder(res.args)
      })

    this.state.exchange.OrderExecuted({ fromBlock: 'latest', toBlock: 'latest' })
      .watch((err, res) => {
        console.log(`Order Executed! TxHash: ${res.transactionHash} \n ${JSON.stringify(res.args)}`)
        this.removeOrder(res.args.id)
      })
  }

  // Buy new tokens with eth
  buy(amount) {
    this.state.token.buy({
      from: this.web3.eth.accounts[this.state.defaultAccount],
      value: amount
    }, (err, res) => {
      err ? console.error(err) : console.log(res)
    })

  }

  // Transfer tokens to a user
  transfer(user, amount) {
    if (amount > 0) {
      // Execute token transfer below
      this.state.token.transfer(this.web3.eth.accounts[this.state.transferUser], amount, {
        from: this.web3.eth.accounts[this.state.defaultAccount]
      }, (err, res) => {
        err ? console.error(err) : console.log(res)
      })
    }

  }

  // When a new account in selected in the available accounts drop down.
  handleDropDownChange = (event, index, defaultAccount) => {
    this.setState({ defaultAccount })

    this.loadAccountBalances(this.state.availableAccounts[index].key)
  }

  handleTransferDropDownChange = (event, index, transferUser) => {
    this.setState({ transferUser })
  }

  // Submit a new order to the order book.
  submitOrder() {
    const { askAmount, bidAmount, defaultAccount, exchange, token } = this.state
    const from = this.web3.eth.accounts[defaultAccount]
    const gas = 1e6

    // First give the exchange the appropriate allowance
    token.approve(exchange.address, bidAmount, { from, gas },
      (err, res) => {
        if (err) {
          console.error(err)
        } else {
          console.log(res)
          // Submit the order to the exchange
          exchange.submitOrder(token.address, bidAmount, '0', askAmount * 10 ** 18, { from, gas },
            (err, res) => {
              err ? console.error(err) : console.log(res)
            })
        }
      })
  }

  // Add a new order to the order book
  addOrder(order) {
    const { orderBook, tokenSymbol } = this.state
    const { id, maker, askAmount, bidAmount } = order;

    // Confirm this order is not already present
    for (let i = 0; i < orderBook.length; i++) {
      if (orderBook[i].key === id) {
        console.error(`Order already exists: ${JSON.stringify(order)}`)
        return
      }
    }

    const row = <TableRow key={id}>
      <TableRowColumn>{maker}</TableRowColumn>
      <TableRowColumn>{tokenSymbol}</TableRowColumn>
      <TableRowColumn>{bidAmount.toNumber()}</TableRowColumn>
      <TableRowColumn>ETH</TableRowColumn>
      <TableRowColumn>{askAmount.toNumber() / 10 ** 18}</TableRowColumn>
    </TableRow>

    this.setState({ orderBook: [row].concat(orderBook) })
  }

  // Remove an order from the orderBook.
  removeOrder(orderId) {
    const { orderBook } = this.state

    for (let i = 0; i < orderBook.length; i++) {
      if (orderBook[i].key === orderId) {
        let updatedOrderBook = orderBook.slice();
        updatedOrderBook.splice(i, 1);
        this.setState({ orderBook: updatedOrderBook })
        return
      }
    }
  }

  // Load all orders into the order book via exchange events
  loadOrderBook() {
    const { exchange } = this.state

    exchange.OrderSubmitted({}, { fromBlock: 0, toBlock: 'latest' })
      .get((err, orders) => {
        for (let i = 0; i < orders.length; i++) {
          // confirm the order still exists then append to table
          exchange.orderBook_(orders[i].args.id, (err, order) => {
            if (order[4].toNumber() !== 0) {
              this.addOrder(orders[i].args)
            }
          })
        }
      })
  }

  // Execute a selected order
  executeOrder(orderId) {
    if (orderId) {
      const { exchange } = this.state
      const from = this.web3.eth.accounts[this.state.defaultAccount]
      const gas = 1e6

      // Get the ask amount of the order from the contract, ether to send along with the tx
      exchange.orderBook_(orderId, (err, order) => {
        exchange.executeOrder(orderId, { from, gas, value: order[4] },
          (err, res) => {
            err ? console.error(err) : console.log(res)
          })
      })
    } else {
      console.error(`Undefined orderId: ${orderId}`)
    }
  }

  render() {
    let component

    component = <div>
      <Link to={'exchange'}>
        <RaisedButton label=">>> Exchange" secondary={true} fullWidth={true} />
      </Link>
      <h3>Active Account</h3>
      <DropDownMenu maxHeight={300} width={500} value={this.state.defaultAccount} onChange={this.handleDropDownChange}>
        {this.state.availableAccounts}
      </DropDownMenu>
      <h3>Balances</h3>
      <p className="App-intro">{this.state.ethBalance / 1e18} ETH</p>
      <p className="App-intro"> {this.state.tokenBalance} {this.state.tokenSymbol}</p>
      <br />
      <div>
        <h3>Buy Tokens</h3>
        <h5>Rate: {this.state.rate} {this.state.tokenSymbol} / wei</h5>
        <TextField floatingLabelText="Token Amount." style={{ width: 200 }} value={this.state.amount}
          onChange={(e, amount) => { this.setState({ amount }) }}
        />
        <RaisedButton label="Buy" labelPosition="before" primary={true}
          onClick={() => this.buy(this.state.amount / this.state.rate)}
        />
      </div>
      <div>
        <h3>Transfer Tokens To Account</h3>
        <DropDownMenu maxHeight={300} width={500} value={this.state.transferUser} onChange={this.handleTransferDropDownChange}>
          {this.state.availableAccounts}
        </DropDownMenu>
        <br />
        <TextField floatingLabelText="Amount." style={{ width: 100 }} value={this.state.transferAmount}
          onChange={(e, transferAmount) => { this.setState({ transferAmount }) }}
        />
        <RaisedButton label="Transfer" labelPosition="before" primary={true}
          onClick={() => this.transfer(this.state.transferUser, this.state.transferAmount)}
        />
      </div>
      <br />

    </div>

    const exchange = <div>
      <Link to={'/'}>
        <RaisedButton label="Wallet <<<" primary={true} fullWidth={true} />
      </Link>
      <h3>Active Account</h3>
      <DropDownMenu maxHeight={300} width={500} value={this.state.defaultAccount} onChange={this.handleDropDownChange}>
        {this.state.availableAccounts}
      </DropDownMenu>
      <h3>Account Balances</h3>
      <p className="App-intro">{this.state.ethBalance / 1e18} ETH</p>
      <p className="App-intro"> {this.state.tokenBalance} {this.state.tokenSymbol}</p>
      <br />
      <h3>Submit an Order!</h3>
      <p>The default exchange supports only the pairing of {this.state.tokenSymbol} / ETH</p>
      <TextField floatingLabelText="Bid" style={{ width: 75 }} value={this.state.tokenSymbol} />
      <TextField floatingLabelText="Amount" style={{ width: 75 }} value={this.state.bidAmount}
        onChange={(e, bidAmount) => this.setState({ bidAmount })}
      />
      <TextField floatingLabelText="Ask" style={{ width: 75 }} value="ETH" />
      <TextField floatingLabelText="Amount" style={{ width: 75 }} value={this.state.askAmount}
        onChange={(e, askAmount) => this.setState({ askAmount })}
      />
      <br />
      <RaisedButton label="Submit" labelPosition="after" style={{ width: 300 }} secondary={true}
        onClick={() => this.submitOrder()}
      />
      <br />
      <br />
      <h3>Order Book</h3>
      <p>Select an order to execute!</p>
      <RaisedButton label="Execute Order" labelPosition="after" style={{ width: 300 }} secondary={true}
        onClick={() => this.executeOrder(this.selectedOrder)}
      />
      <Table style={{ maxHeight: 500, overflow: "auto" }} fixedHeader={true} multiSelectable={false}
        onRowSelection={r => { if (this.state.orderBook[r[0]]) this.selectedOrder = this.state.orderBook[r[0]].key }}>
        <TableHeader>
          <TableRow>
            <TableHeaderColumn>Maker</TableHeaderColumn>
            <TableHeaderColumn>Bid Token</TableHeaderColumn>
            <TableHeaderColumn>Bid Amount</TableHeaderColumn>
            <TableHeaderColumn>Ask Token</TableHeaderColumn>
            <TableHeaderColumn>Ask Amount</TableHeaderColumn>
          </TableRow>
        </TableHeader>
        <TableBody> {this.state.orderBook} </TableBody>
      </Table>
    </div>

    return (
      <MuiThemeProvider>
        <BrowserRouter>
          <div className="App">
            <header className="App-header">
              <img src={logo} alt="logo" style={{ height: '150px', width: '350px' }} />
            </header>
            <Route exact={true} path="/" render={() => component} />
            <Route exact={true} path="/exchange" render={() => exchange}></Route>
          </div>
        </BrowserRouter>
      </MuiThemeProvider>

    );
  }
}

export default App;
