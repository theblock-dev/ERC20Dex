const Dai = artifacts.require('DAI.sol');
const Bat = artifacts.require('BAT.sol');
const Rep = artifacts.require('Rep.sol');
const Zrx = artifacts.require('ZRX.sol');

const Dex = artifacts.require('DEX.sol');

const {BN, constants, expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const { inTransaction } = require('@openzeppelin/test-helpers/src/expectEvent');
const { assertion } = require('@openzeppelin/test-helpers/src/expectRevert');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');

const SIDE = {
    BUY:0,
    SELL:1
};

contract('DEX', (accounts) =>{

    let dai, bat, rep, zrx, dex;
    const [DAI,BAT,REP,ZRX] = ['DAI','BAT','REP','ZRX'].map(ticker => web3.utils.fromAscii(ticker));
    const [trader1, trader2] = [accounts[1],accounts[2]];

    // const DAI = web3.utils.fromAscii('DAI'); //another way to get bytes32 from the ticker

    beforeEach(async () => {
        ([dai,bat,rep,zrx] = await Promise.all([
            Dai.new(),
            Bat.new(),
            Rep.new(),
            Zrx.new(),
        ]));
        
        dex = await Dex.new();

        await Promise.all([
            dex.addToken(DAI,dai.address),
            dex.addToken(BAT,bat.address),
            dex.addToken(REP,rep.address),
            dex.addToken(ZRX,zrx.address),
        ]);

        let amount = web3.utils.toWei('1000');  //amount of token initially deposited for each ERC20 token, 1000 * 10^18

        const seedTokenBalance = async (token,trader) => {
            await token.faucet(trader,amount);
            await token.approve(dex.address,amount,{from:trader});
        };

        await Promise.all(
            [dai,bat,rep,zrx].map(token => seedTokenBalance(token,trader1))
        );
        
        await Promise.all(
            [dai,bat,rep,zrx].map(token => seedTokenBalance(token,trader2))
        );
    });  //end of before each

    //testing deposit function
    it('should deposit tokens', async() => {
        let amountTo = web3.utils.toWei('100');
        await dex.deposit(DAI, amountTo, {from:trader1});

        let balance = await dex.traderBalance(trader1,DAI);
        assert(balance.toString() === amountTo, 'Balance is not correct');
    });
    
    it('should throw error if Token is not in registry', async function(){
        let amountTo = web3.utils.toWei('100');
        let token = web3.utils.fromAscii('ABC');
        await expectRevert(dex.deposit(token, amountTo, {from:trader1}),
            'Token does not exist');
    });


    it('should withdraw tokens', async() => {
        let amount = web3.utils.toWei('100');
        await dex.deposit(DAI, amount, {from:trader1});
        await dex.withdraw(DAI,amount,{from:trader1});
        
        let [balance,daiBalance] = await Promise.all([
            dex.traderBalance(trader1,DAI), 
            dai.balanceOf(trader1),
        ]);

        assert(balance.isZero());
        assert(daiBalance.toString() === web3.utils.toWei('1000'));
    });

    it('should not withdraw if token does not exist', async() => {
        let amountTo = web3.utils.toWei('100');
        let token = web3.utils.fromAscii('ABC');

        await expectRevert(
            dex.withdraw(token,amountTo,{from:trader1}),
            'Token does not exist'
        );
    });

    it('should throw error if trader balance is low', async() => {
        let amount = web3.utils.toWei('100');
        let amount2 = web3.utils.toWei('200');

        await dex.deposit(DAI,amount,{from:trader1});

        await expectRevert(
            dex.withdraw(DAI,amount2,{from:trader1}),
            'Balance too low'
        );
    });

    it('should create a Limit Order', async() => {
        let amount = web3.utils.toWei('100');
        let buyAmount = web3.utils.toWei('10');

        await dex.deposit(DAI, amount, {from:trader1});
        
        await dex.createLimitOrder(REP,buyAmount,10,SIDE.BUY,{from:trader1});

        let buyOrders = await dex.getOrders(REP,SIDE.BUY);
        let sellOrders = await dex.getOrders(REP,SIDE.SELL);

        assert(buyOrders.length === 1);
        assert(sellOrders.length === 0);
        assert(buyOrders[0].trader === trader1);
        assert(buyOrders[0].ticker === web3.utils.padRight(REP,64));
        assert(buyOrders[0].amount === buyAmount);
        assert(buyOrders[0].price === '10');
        //assert(buyOrders[0].side === '0');

        await dex.deposit(DAI, web3.utils.toWei('200'), {from:trader2});
        
        await dex.createLimitOrder(REP,buyAmount,11,SIDE.BUY,{from:trader2});

        buyOrders = await dex.getOrders(REP,SIDE.BUY);
        sellOrders = await dex.getOrders(REP,SIDE.SELL);

        assert(buyOrders.length === 2);
        assert(sellOrders.length === 0);  
        assert(buyOrders[0].trader === trader2); //sorting of the order book based on price
        assert(buyOrders[0].price === '11');

        await dex.createLimitOrder(REP,buyAmount,9,SIDE.BUY,{from:trader2});

        buyOrders = await dex.getOrders(REP,SIDE.BUY);
        sellOrders = await dex.getOrders(REP,SIDE.SELL);

        assert(buyOrders.length === 3);
        assert(sellOrders.length === 0);  
        assert(buyOrders[0].trader === trader2); //sorting of the order book based on price
        assert(buyOrders[1].price === '10');
        assert(buyOrders[2].price === '9');
    });

    it('should throw error while creating Limit Order if Token does not exist', async function() {
        let amount = web3.utils.toWei('100');
        let buyAmount = web3.utils.toWei('10');
        let token = web3.utils.fromAscii('ABC');

        await dex.deposit(DAI, amount, {from:trader1});

        await expectRevert(
            dex.createLimitOrder(token,buyAmount,10,SIDE.BUY,{from:trader1}),
            'Token does not exist'
        );
    });

    it('should not allow to create Limit Order if Token is DAI', async function() {
        let amount = web3.utils.toWei('100');
        let buyAmount = web3.utils.toWei('10');
        //let token = web3.utils.fromAscii('ABC');

        await dex.deposit(DAI, amount, {from:trader1});

        await expectRevert(
            dex.createLimitOrder(DAI,buyAmount,10,SIDE.BUY,{from:trader1}),
            'Cannot trade DAI'
        );
    });

    it('should not allow to create Limit Order if Token balance is too low', async function() {
        let amount = web3.utils.toWei('10');
        let buyAmount = web3.utils.toWei('100');
        //let token = web3.utils.fromAscii('ABC');

        await dex.deposit(REP, amount, {from:trader1});

        await expectRevert(
            dex.createLimitOrder(REP,buyAmount,10,SIDE.SELL,{from:trader1}),
            'token balance too low'
        );
    });

    it('should now allow Limit Order if DAI balance is too low', async () => {
        
        await dex.deposit(DAI,web3.utils.toWei('10'),{from:trader1});
        await expectRevert(
            dex.createLimitOrder(REP,web3.utils.toWei('10'),10,SIDE.BUY,{from:trader1}),
            'DAI balance too low'
        );
    });

    it.only('should create MO and match against Limit Order', async () => {
        await dex.deposit(DAI,web3.utils.toWei('100'),{from:trader1});
        //await dex.deposit(REP,web3.utils.toWei('100'), {from:trader1});

        await dex.createLimitOrder(REP,web3.utils.toWei('10'),10,SIDE.BUY,{from:trader1});

        await dex.deposit(REP,web3.utils.toWei('100'), {from:trader2});

        await dex.createMarketOrder(REP,web3.utils.toWei('5'),SIDE.SELL,{from:trader2});

        const balances = await Promise.all([
            dex.traderBalance(trader1,DAI),
            dex.traderBalance(trader1,REP),
            dex.traderBalance(trader2,DAI),
            dex.traderBalance(trader2,REP),
        ]);

        const orders2 = await dex.getOrders(REP, SIDE.BUY);

        //console.log(orders[0]);
        assert(orders2.length === 1);
        assert(orders2[0].filled === web3.utils.toWei('5'));
        //console.log('balance'+balances);
        assert(balances[0].toString() === web3.utils.toWei('50'), 'not equal');
        assert(balances[1].toString() === web3.utils.toWei('5'));
        assert(balances[2].toString() === web3.utils.toWei('50'));
        assert(balances[3].toString() === web3.utils.toWei('95'));
    });

    it('should throw error while creating Market Order if Token does not exist', async function() {
        let amount = web3.utils.toWei('100');
        let buyAmount = web3.utils.toWei('10');
        let token = web3.utils.fromAscii('ABC');

       // await dex.deposit(DAI, amount, {from:trader1});

        await expectRevert(
            dex.createMarketOrder(token,buyAmount,SIDE.BUY,{from:trader1}),
            'Token does not exist'
        );
    });

    
    it('should not allow to create market Order if Token balance is too low', async function() {
        let amount = web3.utils.toWei('10');
        let buyAmount = web3.utils.toWei('100');
        //let token = web3.utils.fromAscii('ABC');

        await dex.deposit(REP, amount, {from:trader1});

        await expectRevert(
            dex.createMarketOrder(REP,buyAmount,SIDE.SELL,{from:trader1}),
            'Token Balance too low !'
        );
    });

    it('should not allow Market Order if DAI Balance is too low', async function() {
        await dex.deposit(REP,web3.utils.toWei('100'),{from:trader1});
        
        await dex.createLimitOrder(REP,web3.utils.toWei('100'),10,SIDE.SELL,{from:trader1});

        await expectRevert(
            dex.createMarketOrder(REP,web3.utils.toWei('100'),SIDE.BUY,{from:trader2}),
            'dai balance too low'
        );
    });
    
});