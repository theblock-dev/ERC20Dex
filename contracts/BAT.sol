// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0<=0.9.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract BAT is ERC20 {

    constructor() ERC20('BAT Token','BAT'){
        
    }

    function faucet(address to, uint amount) external {
        _mint(to, amount);        
    }
}