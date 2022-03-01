// SPDX-License-Identifier: MIT

pragma solidity >=0.8.0 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';

contract DEX {

  using SafeMath for uint;
  enum Side {
    BUY,
    SELL
  }

  struct Order {
    uint id;
    address trader;
    Side side;
    bytes32 ticker;
    uint amount;
    uint filled;
    uint price;
    uint date;
  }

  struct Token {
    bytes32 ticker;
    address tokenAddress;
  }

  mapping(bytes32 => Token) public tokens;
  bytes32[] public TokenList;
  mapping(address => mapping(bytes32 => uint)) public traderBalance;
  mapping(bytes32 => mapping(uint => Order[])) public orderBook;
  
  
  address public admin;
  uint public nextOrderId;
  uint public nextTradeId;

  bytes32 constant DAI = bytes32('DAI');

  event NewTrade(
    uint tradeId,
    uint orderId,
    bytes32 indexed ticker,
    address indexed trader1,
    address indexed trader2,
    uint amount,
    uint price,
    uint date
  );


  constructor() {
    admin = msg.sender;
  }

  function addToken(bytes32 _ticker, address _tokenAddress) external onlyAdmin() {
    tokens[_ticker] = Token(_ticker,_tokenAddress);
    TokenList.push(_ticker);
  }

  modifier onlyAdmin() {
    require(msg.sender == admin, 'Only Admin can perform this operation');
    _;
  }

  modifier tokenExist(bytes32 _ticker) {
    require(tokens[_ticker].tokenAddress !=address(0),'Token does not exist');
    _;
  }

  function deposit(bytes32 _ticker,uint _amount) tokenExist(_ticker) external {
    IERC20(tokens[_ticker].tokenAddress).transferFrom(msg.sender,address(this),_amount);
    
    traderBalance[msg.sender][_ticker] = traderBalance[msg.sender][_ticker].add(_amount);    
  }

  function withdraw(bytes32 _ticker, uint _amount) tokenExist(_ticker) external {
    require(traderBalance[msg.sender][_ticker] >=_amount,'Balance too low');
    IERC20(tokens[_ticker].tokenAddress).transfer(msg.sender,_amount);
    //traderBalance[msg.sender][_ticker] -= _amount;
    traderBalance[msg.sender][_ticker] = traderBalance[msg.sender][_ticker].sub(_amount);  //using safemath
  }

  function createLimitOrder(bytes32 _ticker, uint _amount, uint _price, Side _side) tokenExist(_ticker) external {
    require(_ticker != DAI,'Cannot trade DAI');

    if(_side == Side.SELL) {
      require(traderBalance[msg.sender][_ticker] >= _amount, 'token balance too low');

    } else if (_side == Side.BUY) {
      require(traderBalance[msg.sender][DAI] >= _amount.mul(_price), 'DAI balance too low');
    }

    //add it to the orderbook
    Order[] storage orders = orderBook[_ticker][uint(_side)];
    orders.push(Order(nextOrderId,msg.sender,_side,_ticker,_amount,0,_price,block.timestamp));

    //now sort the Order array based on price...
    //for SELL - Price would be descending
    //for Buy - price would be ascending

    uint i = (orders.length > 0 ) ? orders.length-1 : 0 ;  
    //if Order length is zero, then it will be zero..
    //else it will be orders.ength - 1

    while(i>0) {
      if(_side == Side.BUY && orders[i-1].price > orders[i].price){
        break;
      }
      
      if(_side == Side.SELL && orders[i-1].price < orders[i].price) {
        break;
      }
      
      Order memory order = orders[i-1];
      orders[i-1] = orders[i];
      orders[i] = order;
      //i--; // integer underflow condition, if i is zero...
      i = i.sub(1);
    }

    //nextOrderId++; //integer overflow condition
    nextOrderId = nextOrderId.add(1);  
  }

  function createMarketOrder(bytes32 _ticker, uint _amount, Side _side) tokenExist(_ticker) external {
    require(_ticker != DAI, 'can not trade DAI');

    if(_side == Side.SELL) {
      require(traderBalance[msg.sender][_ticker] > _amount, 'Token Balance too low !');
    }

    Order[] storage orders = orderBook[_ticker][uint(_side == Side.BUY ? Side.SELL : Side.BUY)];
    uint remaining = _amount; 
    uint i ;
    while(i < orders.length && remaining > 0) {
      uint available = orders[i].amount.sub(orders[i].filled);
      uint matched = (remaining > available) ? available : remaining ;
      remaining = remaining.sub(matched);
      orders[i].filled = orders[i].filled.add(matched);

      emit NewTrade(nextTradeId, orders[i].id, _ticker, orders[i].trader, msg.sender, matched, orders[i].price, block.timestamp);
      
      if(_side == Side.SELL) {
        traderBalance[msg.sender][_ticker] = traderBalance[msg.sender][_ticker].sub(matched);
        traderBalance[msg.sender][DAI] = traderBalance[msg.sender][DAI].add(matched.mul(orders[i].price));
        traderBalance[orders[i].trader][_ticker] = traderBalance[orders[i].trader][_ticker].add(matched);
        traderBalance[orders[i].trader][DAI] = traderBalance[orders[i].trader][DAI].sub(matched.mul(orders[i].price));
      }
      if(_side == Side.BUY) {
        require(traderBalance[msg.sender][DAI] >= matched.mul(orders[i].price),'dai balance too low');

        traderBalance[msg.sender][_ticker] = traderBalance[msg.sender][_ticker].add(matched);
        traderBalance[msg.sender][DAI] = traderBalance[msg.sender][DAI].sub(matched.mul(orders[i].price));
        traderBalance[orders[i].trader][_ticker] = traderBalance[orders[i].trader][_ticker].sub(matched);
        traderBalance[orders[i].trader][DAI] = traderBalance[orders[i].trader][DAI].add(matched.mul(orders[i].price));
      }

      nextTradeId = nextTradeId.add(1);
      i = i.add(1);
    }

    i=0;
    while(i< orders.length && orders[i].filled == orders[i].amount){
      for(uint j=i;j< orders.length -1;j++){
        orders[j]= orders[j+1];
      }
      orders.pop(); //remove last item of array
      i = i.add(1);
    }     
    

  } //End of function Market Order

  function getOrders(bytes32 _ticker, Side _side) external view returns(Order[] memory) {
    return orderBook[_ticker][uint(_side)];
  }

  function getTokens() external view returns(Token[] memory) {
    Token[] memory _tokens = new Token[](TokenList.length);
    for(uint i=0;i < TokenList.length;i++){
      _tokens[i] = Token(tokens[TokenList[i]].ticker, tokens[TokenList[i]].tokenAddress);
    }
    return _tokens;
  }
}
