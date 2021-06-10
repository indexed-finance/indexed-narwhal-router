import { createFixtureLoader } from '@ethereum-waffle/provider'
import { expect } from 'chai'
import { BigNumber, constants, ContractTransaction } from 'ethers'
import { ethers, waffle } from 'hardhat'
import { IIndexPool, IndexedNarwhalRouter, IUniswapV2Pair, IUniswapV2Factory, IERC20, IWETH, WETH9 } from '../typechain'
import { narwhalFixture } from './shared/fixtures'
import { expandTo18Decimals, swapInGivenOut, swapOutGivenIn } from './shared/utilities'


describe('IndexedNarwhalRouter', () => {
  const wallets = waffle.provider.getWallets()
  const [wallet] = wallets;
  const loadFixture = createFixtureLoader(wallets, waffle.provider)

  let weth: WETH9
  let token0: IERC20
  let token1: IERC20
  let uniswapFactory: IUniswapV2Factory
  let sushiswapFactory: IUniswapV2Factory
  let pair_0_1_sushi: IUniswapV2Pair
  let pair_0_1_uni: IUniswapV2Pair
  let pair_0_weth_uni: IUniswapV2Pair
  let indexPool: IIndexPool
  let router: IndexedNarwhalRouter

  let allInGivenPoolOut: (n: BigNumber) => BigNumber[]
  let poolOutGivenTokenIn: (n: BigNumber) => BigNumber
  let tokenInGivenPoolOut: (n: BigNumber) => BigNumber
  let tokenOutGivenPoolIn: (n: BigNumber) => BigNumber
  let poolInGivenTokenOut: (n: BigNumber) => BigNumber
  let allOutGivenPoolIn: (n: BigNumber) => BigNumber[]

  beforeEach(async () => {
    const fixture = await loadFixture(narwhalFixture)
    weth = fixture.weth
    token0 = fixture.token0
    token1 = fixture.token1
    uniswapFactory = fixture.uniswapFactory
    sushiswapFactory = fixture.sushiswapFactory
    pair_0_1_sushi = fixture.pair_0_1_sushi
    pair_0_1_uni = fixture.pair_0_1_uni
    pair_0_weth_uni = fixture.pair_0_weth_uni
    indexPool = fixture.indexPool
    router = fixture.router
    poolOutGivenTokenIn = fixture.poolOutGivenTokenIn
    tokenInGivenPoolOut = fixture.tokenInGivenPoolOut
    tokenOutGivenPoolIn = fixture.tokenOutGivenPoolIn
    poolInGivenTokenOut = fixture.poolInGivenTokenOut
    allInGivenPoolOut = fixture.allInGivenPoolOut
    allOutGivenPoolIn = fixture.allOutGivenPoolIn
  })

  function encodePathToken(token: string, sushi: boolean) {
    return [
      '0x',
      token.slice(2).padStart(62, '0'),
      sushi ? '01' : '00'
    ].join('');
  }

  function encodeIntermediary(token: string, sushiPrevious: boolean, sushiNext: boolean) {
    return [
      `0x${'00'.repeat(10)}`,
      sushiPrevious ? '01' : '00',
      token.slice(2).padStart(40, '0'),
      sushiNext ? '01' : '00'
    ].join('');
  }

  async function addLiquidity() {
    await token0.transfer(pair_0_1_sushi.address, expandTo18Decimals(1000))
    await token0.transfer(pair_0_1_uni.address, expandTo18Decimals(1000))
    await token1.transfer(pair_0_1_sushi.address, expandTo18Decimals(1000))
    await token1.transfer(pair_0_1_uni.address, expandTo18Decimals(1000))
    await token0.transfer(pair_0_weth_uni.address, expandTo18Decimals(1000))
    await weth.deposit({ value: expandTo18Decimals(1000) })
    await weth.transfer(pair_0_weth_uni.address, expandTo18Decimals(1000))
    await pair_0_1_sushi.mint(wallet.address)
    await pair_0_1_uni.mint(wallet.address)
    await pair_0_weth_uni.mint(wallet.address)
  }

  async function getTransactionCost(tx: Promise<ContractTransaction>) {
    const { gasPrice, wait } = await tx;
    const { gasUsed } = await wait();
    return gasUsed.mul(gasPrice);
  }

  describe('swapExactETHForTokensAndMint', () => {
    const swapAmount = expandTo18Decimals(1)
    const expectedOutput0 = swapOutGivenIn(swapAmount, expandTo18Decimals(1000), expandTo18Decimals(1000));
    const expectedOutput1 = swapOutGivenIn(expectedOutput0, expandTo18Decimals(1000), expandTo18Decimals(1000));
    let expectedPoolOutput0: BigNumber
    let expectedPoolOutput1: BigNumber

    beforeEach(async () => {
      await addLiquidity()
      expectedPoolOutput0 = poolOutGivenTokenIn(expectedOutput1)
      expectedPoolOutput1 = poolOutGivenTokenIn(expectedOutput0)
    })

    it('Uni -> Sushi -> Pool', async () => {
      await expect(
        router.swapExactETHForTokensAndMint(
          [encodePathToken(weth.address, false), encodePathToken(token0.address, true), encodePathToken(token1.address, false)],
          indexPool.address,
          0,
          { value: swapAmount }
        )
      )
      .to.emit(weth, 'Transfer')
      .withArgs(router.address, pair_0_weth_uni.address, swapAmount)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_weth_uni.address, pair_0_1_sushi.address, expectedOutput0)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_sushi.address, router.address, expectedOutput1)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedOutput1)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedPoolOutput0)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, expectedPoolOutput0)
    })

    it('Uni -> Pool', async () => {
      await expect(
        router.swapExactETHForTokensAndMint(
          [encodePathToken(weth.address, false), encodePathToken(token0.address, true)],
          indexPool.address,
          0,
          { value: swapAmount }
        )
      )
      .to.emit(weth, 'Transfer')
      .withArgs(router.address, pair_0_weth_uni.address, swapAmount)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_weth_uni.address, router.address, expectedOutput0)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedOutput0)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedPoolOutput1)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, expectedPoolOutput1)
    })
  })

  describe('swapExactTokensForTokensAndMint', () => {
    const swapAmount = expandTo18Decimals(1)
    const expectedOutput0 = swapOutGivenIn(swapAmount, expandTo18Decimals(1000), expandTo18Decimals(1000));
    let expectedPoolOutput: BigNumber

    beforeEach(async () => {
      await addLiquidity()
      expectedPoolOutput = poolOutGivenTokenIn(expectedOutput0)
    })

    it('Sushi -> Pool', async () => {
      await token0.approve(router.address, swapAmount)
      await expect(
        router.swapExactTokensForTokensAndMint(
          swapAmount,
          [encodePathToken(token0.address, true), encodePathToken(token1.address, false)],
          indexPool.address,
          0,
        )
      )
      .to.emit(token0, 'Transfer')
      .withArgs(wallet.address, pair_0_1_sushi.address, swapAmount)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_sushi.address, router.address, expectedOutput0)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedOutput0)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedPoolOutput)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, expectedPoolOutput)
    })

    it('Uni -> Pool', async () => {
      await token0.approve(router.address, swapAmount)
      await expect(
        router.swapExactTokensForTokensAndMint(
          swapAmount,
          [encodePathToken(token0.address, false), encodePathToken(token1.address, false)],
          indexPool.address,
          0,
        )
      )
      .to.emit(token0, 'Transfer')
      .withArgs(wallet.address, pair_0_1_uni.address, swapAmount)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_uni.address, router.address, expectedOutput0)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedOutput0)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedPoolOutput)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, expectedPoolOutput)
    })
  })

  describe('burnExactAndSwapForTokens', () => {
    const poolAmount = expandTo18Decimals(1)
    let expectedPoolOutput: BigNumber
    let expectedOutput0: BigNumber
    let expectedOutput1: BigNumber

    beforeEach(async () => {
      await addLiquidity()
      expectedPoolOutput = tokenOutGivenPoolIn(poolAmount)
      expectedOutput0 = swapOutGivenIn(expectedPoolOutput, expandTo18Decimals(1000), expandTo18Decimals(1000));
      expectedOutput1 = swapOutGivenIn(expectedOutput0, expandTo18Decimals(1000), expandTo18Decimals(1000));
    })

    it('Pool -> Sushi', async () => {
      await indexPool.approve(router.address, poolAmount)
      await expect(
        router.burnExactAndSwapForTokens(
          indexPool.address,
          poolAmount,
          [encodePathToken(token0.address, true), encodePathToken(token1.address, false)],
          0,
        )
      )
      .to.emit(indexPool, 'Transfer')
      .withArgs(wallet.address, router.address, poolAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, indexPool.address, poolAmount)
      .to.emit(token0, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedPoolOutput)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, pair_0_1_sushi.address, expectedPoolOutput)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_sushi.address, wallet.address, expectedOutput0)
    })

    it('Pool -> Uni', async () => {
      await indexPool.approve(router.address, poolAmount)
      await expect(
        router.burnExactAndSwapForTokens(
          indexPool.address,
          poolAmount,
          [encodePathToken(token0.address, false), encodePathToken(token1.address, false)],
          0,
        )
      )
      .to.emit(indexPool, 'Transfer')
      .withArgs(wallet.address, router.address, poolAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, indexPool.address, poolAmount)
      .to.emit(token0, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedPoolOutput)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, pair_0_1_uni.address, expectedPoolOutput)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_uni.address, wallet.address, expectedOutput0)
    })
  })

  describe('burnExactAndSwapForETH', () => {
    const poolAmount = expandTo18Decimals(1)
    let expectedPoolOutput: BigNumber
    let expectedOutput0: BigNumber
    let expectedOutput1: BigNumber

    beforeEach(async () => {
      await addLiquidity()
      expectedPoolOutput = tokenOutGivenPoolIn(poolAmount)
      expectedOutput0 = swapOutGivenIn(expectedPoolOutput, expandTo18Decimals(1000), expandTo18Decimals(1000));
      expectedOutput1 = swapOutGivenIn(expectedOutput0, expandTo18Decimals(1000), expandTo18Decimals(1000));
    })

    it('Pool -> Sushi -> Uni', async () => {
      await indexPool.approve(router.address, poolAmount)
      await expect(
        router.burnExactAndSwapForETH(
          indexPool.address,
          poolAmount,
          [encodePathToken(token1.address, true), encodePathToken(token0.address, false), encodePathToken(weth.address, false)],
          0,
        )
      )
      .to.emit(indexPool, 'Transfer')
      .withArgs(wallet.address, router.address, poolAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, indexPool.address, poolAmount)
      .to.emit(token1, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedPoolOutput)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, pair_0_1_sushi.address, expectedPoolOutput)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_1_sushi.address, pair_0_weth_uni.address, expectedOutput0)
      .to.emit(weth, 'Transfer')
      .withArgs(pair_0_weth_uni.address, router.address, expectedOutput1)
      .to.emit(weth, 'Withdrawal')
      .withArgs(router.address, expectedOutput1)
    })

    it('Pool -> Uni -> Uni', async () => {
      await indexPool.approve(router.address, poolAmount)
      await expect(
        router.burnExactAndSwapForETH(
          indexPool.address,
          poolAmount,
          [encodePathToken(token1.address, false), encodePathToken(token0.address, false), encodePathToken(weth.address, false)],
          0,
        )
      )
      .to.emit(indexPool, 'Transfer')
      .withArgs(wallet.address, router.address, poolAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, indexPool.address, poolAmount)
      .to.emit(token1, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedPoolOutput)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, pair_0_1_uni.address, expectedPoolOutput)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_1_uni.address, pair_0_weth_uni.address, expectedOutput0)
      .to.emit(weth, 'Transfer')
      .withArgs(pair_0_weth_uni.address, router.address, expectedOutput1)
      .to.emit(weth, 'Withdrawal')
      .withArgs(router.address, expectedOutput1)
    })
  })

  describe('swapETHForTokensAndMintExact', () => {
    const mintAmount = expandTo18Decimals(1)
    let expectedAmount0: BigNumber
    let expectedAmount1: BigNumber
    let expectedPoolInput: BigNumber

    beforeEach(async () => {
      await addLiquidity()
      expectedPoolInput = tokenInGivenPoolOut(mintAmount)
      expectedAmount1 = swapInGivenOut(expectedPoolInput, expandTo18Decimals(1000), expandTo18Decimals(1000))
      expectedAmount0 = swapInGivenOut(expectedAmount1, expandTo18Decimals(1000), expandTo18Decimals(1000))
    })

    it('Uni -> Sushi -> Pool', async () => {
      await expect(
        router.swapETHForTokensAndMintExact(
          [encodePathToken(weth.address, false), encodePathToken(token0.address, true), encodePathToken(token1.address, false)],
          indexPool.address,
          mintAmount,
          { value: expectedAmount0.mul(2) }
        )
      )
      .to.emit(weth, 'Deposit')
      .withArgs(router.address, expectedAmount0)
      .to.emit(weth, 'Transfer')
      .withArgs(router.address, pair_0_weth_uni.address, expectedAmount0)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_weth_uni.address, pair_0_1_sushi.address, expectedAmount1)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_sushi.address, router.address, expectedPoolInput)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolInput)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, mintAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, mintAmount)

      expect(await weth.balanceOf(router.address)).to.eq(0)
      expect(await ethers.provider.getBalance(router.address)).to.eq(0)
    })

    it('Uni -> Uni -> Pool', async () => {
      await expect(
        router.swapETHForTokensAndMintExact(
          [encodePathToken(weth.address, false), encodePathToken(token0.address, false), encodePathToken(token1.address, false)],
          indexPool.address,
          mintAmount,
          { value: expectedAmount0.mul(2) }
        )
      )
      .to.emit(weth, 'Deposit')
      .withArgs(router.address, expectedAmount0)
      .to.emit(weth, 'Transfer')
      .withArgs(router.address, pair_0_weth_uni.address, expectedAmount0)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_weth_uni.address, pair_0_1_uni.address, expectedAmount1)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_uni.address, router.address, expectedPoolInput)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolInput)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, mintAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, mintAmount)

      expect(await weth.balanceOf(router.address)).to.eq(0)
      expect(await ethers.provider.getBalance(router.address)).to.eq(0)
    })
  })

  describe('swapTokensForTokensAndMintExact', () => {
    const mintAmount = expandTo18Decimals(1)
    let expectedAmount0: BigNumber
    let expectedPoolInput: BigNumber

    beforeEach(async () => {
      await addLiquidity()
      expectedPoolInput = tokenInGivenPoolOut(mintAmount)
      expectedAmount0 = swapInGivenOut(expectedPoolInput, expandTo18Decimals(1000), expandTo18Decimals(1000))
    })

    it('Sushi -> Pool', async () => {
      await token0.approve(router.address, expectedAmount0)
      await expect(
        router.swapTokensForTokensAndMintExact(
          expectedAmount0,
          [encodePathToken(token0.address, true), encodePathToken(token1.address, false)],
          indexPool.address,
          mintAmount,
        )
      )
      .to.emit(token0, 'Transfer')
      .withArgs(wallet.address, pair_0_1_sushi.address, expectedAmount0)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_sushi.address, router.address, expectedPoolInput)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolInput)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, mintAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, mintAmount)

      expect(await token0.balanceOf(router.address)).to.eq(0)
    })

    it('Uni -> Pool', async () => {
      await token1.approve(router.address, expectedAmount0)
      await expect(
        router.swapTokensForTokensAndMintExact(
          expectedAmount0,
          [encodePathToken(token1.address, false), encodePathToken(token0.address, false)],
          indexPool.address,
          mintAmount,
        )
      )
      .to.emit(token1, 'Transfer')
      .withArgs(wallet.address, pair_0_1_uni.address, expectedAmount0)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_1_uni.address, router.address, expectedPoolInput)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolInput)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, mintAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, mintAmount)

      expect(await token1.balanceOf(router.address)).to.eq(0)
    })
  })

  describe('burnAndSwapForExactTokens', () => {
    const amountOut = expandTo18Decimals(1)
    let expectedPoolAmount: BigNumber
    let expectedSwapInput: BigNumber

    beforeEach(async () => {
      await addLiquidity()
      expectedSwapInput = swapInGivenOut(amountOut, expandTo18Decimals(1000), expandTo18Decimals(1000))
      expectedPoolAmount = poolInGivenTokenOut(expectedSwapInput)
    })

    it('Pool -> Sushi', async () => {
      await indexPool.approve(router.address, expectedPoolAmount)
      await expect(
        router.burnAndSwapForExactTokens(
          indexPool.address,
          expectedPoolAmount,
          [encodePathToken(token0.address, true), encodePathToken(token1.address, false)],
          amountOut,
        )
      )
      .to.emit(indexPool, 'Transfer')
      .withArgs(wallet.address, router.address, expectedPoolAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolAmount)
      .to.emit(token0, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedSwapInput)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, pair_0_1_sushi.address, expectedSwapInput)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_sushi.address, wallet.address, amountOut)
    })

    it('Pool -> Uni', async () => {
      await indexPool.approve(router.address, expectedPoolAmount)
      await expect(
        router.burnAndSwapForExactTokens(
          indexPool.address,
          expectedPoolAmount,
          [encodePathToken(token1.address, false), encodePathToken(token0.address, false)],
          amountOut,
        )
      )
      .to.emit(indexPool, 'Transfer')
      .withArgs(wallet.address, router.address, expectedPoolAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolAmount)
      .to.emit(token1, 'Transfer')
      .withArgs(indexPool.address, router.address, expectedSwapInput)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, pair_0_1_uni.address, expectedSwapInput)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_1_uni.address, wallet.address, amountOut)
    })
  })

  describe('burnAndSwapForExactETH', () => {
    const amountOut = expandTo18Decimals(1)
    let expectedPoolAmount0: BigNumber
    let expectedPoolAmount1: BigNumber
    let expectedSwapInput1: BigNumber
    let expectedSwapInput0: BigNumber

    beforeEach(async () => {
      await addLiquidity()
      expectedSwapInput1 = swapInGivenOut(amountOut, expandTo18Decimals(1000), expandTo18Decimals(1000))
      expectedSwapInput0 = swapInGivenOut(expectedSwapInput1, expandTo18Decimals(1000), expandTo18Decimals(1000))
      expectedPoolAmount0 = poolInGivenTokenOut(expectedSwapInput1)
      expectedPoolAmount1 = poolInGivenTokenOut(expectedSwapInput0)
    })

    it('Pool -> Uni', async () => {
      await indexPool.approve(router.address, expectedPoolAmount0)
      const balanceBefore = await ethers.provider.getBalance(wallet.address)
      const tx = router.burnAndSwapForExactETH(
        indexPool.address,
        expectedPoolAmount0,
        [encodePathToken(token0.address, false), encodePathToken(weth.address, false)],
        amountOut,
      )
      await expect(tx)
        .to.emit(indexPool, 'Transfer')
        .withArgs(wallet.address, router.address, expectedPoolAmount0)
        .to.emit(indexPool, 'Transfer')
        .withArgs(router.address, indexPool.address, expectedPoolAmount0)
        .to.emit(token0, 'Transfer')
        .withArgs(indexPool.address, router.address, expectedSwapInput1)
        .to.emit(token0, 'Transfer')
        .withArgs(router.address, pair_0_weth_uni.address, expectedSwapInput1)
        .to.emit(weth, 'Transfer')
        .withArgs(pair_0_weth_uni.address, router.address, amountOut)
        .to.emit(weth, 'Withdrawal')
        .withArgs(router.address, amountOut)
      expect(
        await ethers.provider.getBalance(wallet.address)
      ).to.eq(balanceBefore.sub(await getTransactionCost(tx)).add(amountOut))
    })

    it('Pool -> Sushi -> Uni', async () => {
      await indexPool.approve(router.address, expectedPoolAmount1)
      const balanceBefore = await ethers.provider.getBalance(wallet.address)
      const tx = router.burnAndSwapForExactETH(
        indexPool.address,
        expectedPoolAmount1,
        [encodePathToken(token1.address, true), encodePathToken(token0.address, false), encodePathToken(weth.address, false)],
        amountOut,
      );
      await expect(tx)
        .to.emit(indexPool, 'Transfer')
        .withArgs(wallet.address, router.address, expectedPoolAmount1)
        .to.emit(indexPool, 'Transfer')
        .withArgs(router.address, indexPool.address, expectedPoolAmount1)
        .to.emit(token1, 'Transfer')
        .withArgs(indexPool.address, router.address, expectedSwapInput0)
        .to.emit(token1, 'Transfer')
        .withArgs(router.address, pair_0_1_sushi.address, expectedSwapInput0)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_sushi.address, pair_0_weth_uni.address, expectedSwapInput1)
        .to.emit(weth, 'Transfer')
        .withArgs(pair_0_weth_uni.address, router.address, amountOut)
        .to.emit(weth, 'Withdrawal')
        .withArgs(router.address, amountOut)
      expect(
        await ethers.provider.getBalance(wallet.address)
      ).to.eq(balanceBefore.sub(await getTransactionCost(tx)).add(amountOut))
    })
  })

  describe('swapTokensForAllTokensAndMintExact', () => {
    const mintAmount = expandTo18Decimals(1)
    let expectedPoolInput0: BigNumber
    let expectedPoolInput1: BigNumber
    let input_weth_0: BigNumber
    let input_weth_0_1: BigNumber
    let input_0_1: BigNumber

    beforeEach(async () => {
      await addLiquidity();
      ([expectedPoolInput0, expectedPoolInput1] = allInGivenPoolOut(mintAmount));
      // weth -> token0
      input_weth_0 = swapInGivenOut(expectedPoolInput0, expandTo18Decimals(1000), expandTo18Decimals(1000))
      // token0 -> token1
      input_0_1 = swapInGivenOut(expectedPoolInput1, expandTo18Decimals(1000), expandTo18Decimals(1000))
      // weth -> token0 -> token1
      input_weth_0_1 = swapInGivenOut(
        input_0_1,
        expandTo18Decimals(1000).add(input_weth_0),
        expandTo18Decimals(1000).sub(expectedPoolInput0)
      )
    })

    it('Sushi -> Pool & User -> Pool', async () => {
      const amountIn = input_0_1.add(expectedPoolInput0)
      await token0.approve(router.address, amountIn)
      await expect(
        router.swapTokensForAllTokensAndMintExact(
          indexPool.address,
          [encodePathToken(constants.AddressZero, false), encodeIntermediary(constants.AddressZero, true, false)],
          mintAmount,
          token0.address,
          amountIn,
        )
      )
      .to.emit(token0, 'Transfer')
      .withArgs(wallet.address, router.address, amountIn)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolInput0)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, pair_0_1_sushi.address, input_0_1)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_sushi.address, router.address, expectedPoolInput1)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolInput1)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, mintAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, mintAmount)
    })

    it('Sushi -> Pool & Uni -> Sushi -> Pool', async () => {
      const amountIn = input_weth_0.add(input_weth_0_1).add(expandTo18Decimals(1))
      await weth.deposit({ value: amountIn })
      await weth.approve(router.address, amountIn)
      await expect(
        router.swapTokensForAllTokensAndMintExact(
          indexPool.address,
          [encodePathToken(constants.AddressZero, false), encodeIntermediary(token0.address, false, true)],
          mintAmount,
          weth.address,
          amountIn,
        )
      )
      .to.emit(weth, 'Transfer')
      .withArgs(wallet.address, router.address, amountIn)
      .to.emit(weth, 'Transfer')
      .withArgs(router.address, pair_0_weth_uni.address, input_weth_0)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_weth_uni.address, router.address, expectedPoolInput0)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolInput0)
      .to.emit(weth, 'Transfer')
      .withArgs(router.address, pair_0_weth_uni.address, input_weth_0_1)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_weth_uni.address, pair_0_1_sushi.address, input_0_1)
      .to.emit(token1, 'Transfer')
      .withArgs(pair_0_1_sushi.address, router.address, expectedPoolInput1)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, indexPool.address, expectedPoolInput1)
      .to.emit(indexPool, 'Transfer')
      .withArgs(indexPool.address, router.address, mintAmount)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, wallet.address, mintAmount)
      .to.emit(weth, 'Transfer') // refund
      .withArgs(router.address, wallet.address, expandTo18Decimals(1))
    })
  })

  describe('swapETHForAllTokensAndMintExact', () => {
    const mintAmount = expandTo18Decimals(1)
    let expectedPoolInput0: BigNumber
    let expectedPoolInput1: BigNumber
    let input_weth_0: BigNumber
    let input_weth_0_1: BigNumber
    let input_0_1: BigNumber

    beforeEach(async () => {
      await addLiquidity();
      ([expectedPoolInput0, expectedPoolInput1] = allInGivenPoolOut(mintAmount));
      // weth -> token0
      input_weth_0 = swapInGivenOut(expectedPoolInput0, expandTo18Decimals(1000), expandTo18Decimals(1000))
      // token0 -> token1
      input_0_1 = swapInGivenOut(expectedPoolInput1, expandTo18Decimals(1000), expandTo18Decimals(1000))
      // weth -> token0 -> token1
      input_weth_0_1 = swapInGivenOut(
        input_0_1,
        expandTo18Decimals(1000).add(input_weth_0),
        expandTo18Decimals(1000).sub(expectedPoolInput0)
      )
    })

    it('Sushi -> Pool & Uni -> Sushi -> Pool', async () => {
      const amountIn = input_weth_0.add(input_weth_0_1)
      const balanceBefore = await ethers.provider.getBalance(wallet.address)
      const tx = router.swapETHForAllTokensAndMintExact(
        indexPool.address,
        [encodePathToken(constants.AddressZero, false), encodeIntermediary(token0.address, false, true)],
        mintAmount,
        { value: amountIn.add(expandTo18Decimals(1)) }
      )
      await expect(tx)
        .to.emit(weth, 'Deposit')
        .withArgs(router.address, amountIn.add(expandTo18Decimals(1)))
        .to.emit(weth, 'Transfer')
        .withArgs(router.address, pair_0_weth_uni.address, input_weth_0)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_weth_uni.address, router.address, expectedPoolInput0)
        .to.emit(token0, 'Transfer')
        .withArgs(router.address, indexPool.address, expectedPoolInput0)
        .to.emit(weth, 'Transfer')
        .withArgs(router.address, pair_0_weth_uni.address, input_weth_0_1)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_weth_uni.address, pair_0_1_sushi.address, input_0_1)
        .to.emit(token1, 'Transfer')
        .withArgs(pair_0_1_sushi.address, router.address, expectedPoolInput1)
        .to.emit(token1, 'Transfer')
        .withArgs(router.address, indexPool.address, expectedPoolInput1)
        .to.emit(indexPool, 'Transfer')
        .withArgs(indexPool.address, router.address, mintAmount)
        .to.emit(indexPool, 'Transfer')
        .withArgs(router.address, wallet.address, mintAmount)
        .to.emit(weth, 'Withdrawal') // refund
        .withArgs(router.address, expandTo18Decimals(1))
      expect(
        await ethers.provider.getBalance(wallet.address)
      ).to.eq(balanceBefore.sub(await getTransactionCost(tx)).sub(amountIn))
    })
  })

  describe('burnForAllTokensAndSwapForTokens', () => {
    const poolIn = expandTo18Decimals(1)
    let input_0: BigNumber
    let input_1: BigNumber
    let output_0_weth: BigNumber
    let output_1_0: BigNumber
    let output_0_weth_1: BigNumber


    beforeEach(async () => {
      await addLiquidity();
      ([input_0, input_1] = allOutGivenPoolIn(poolIn));
      // weth -> token0
      output_0_weth = swapOutGivenIn(input_0, expandTo18Decimals(1000), expandTo18Decimals(1000))
      // token1 -> token0
      output_1_0 = swapOutGivenIn(input_1, expandTo18Decimals(1000), expandTo18Decimals(1000))
      // token1 -> token0 -> weth
      output_0_weth_1 = swapOutGivenIn(
        output_1_0,
        expandTo18Decimals(1000).add(input_0),
        expandTo18Decimals(1000).sub(output_0_weth)
      )
    })

    it('Pool -> Uni & Pool -> Sushi -> Uni', async () => {
      await indexPool.approve(router.address, poolIn)
      await expect(
        router.burnForAllTokensAndSwapForTokens(
          indexPool.address,
          [0, 0],
          [encodePathToken(constants.AddressZero, false), encodeIntermediary(token0.address, true, false)],
          poolIn,
          weth.address,
          0
        )
      )
      .to.emit(indexPool, 'Transfer')
      .withArgs(wallet.address, router.address, poolIn)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, indexPool.address, poolIn)
      .to.emit(token0, 'Transfer')
      .withArgs(indexPool.address, router.address, input_0)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, pair_0_weth_uni.address, input_0)
      .to.emit(weth, 'Transfer')
      .withArgs(pair_0_weth_uni.address, wallet.address, output_0_weth)
      .to.emit(token1, 'Transfer')
      .withArgs(indexPool.address, router.address, input_1)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, pair_0_1_sushi.address, input_1)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_1_sushi.address, pair_0_weth_uni.address, output_1_0)
      .to.emit(weth, 'Transfer')
      .withArgs(pair_0_weth_uni.address, wallet.address, output_0_weth_1)
    })

    it('Pool -> Sushi & Pool -> User', async () => {
      await indexPool.approve(router.address, poolIn)
      await expect(
        router.burnForAllTokensAndSwapForTokens(
          indexPool.address,
          [0, 0],
          [encodePathToken(constants.AddressZero, false), encodeIntermediary(constants.AddressZero, true, false)],
          poolIn,
          token0.address,
          0
        )
      )
      .to.emit(indexPool, 'Transfer')
      .withArgs(wallet.address, router.address, poolIn)
      .to.emit(indexPool, 'Transfer')
      .withArgs(router.address, indexPool.address, poolIn)
      .to.emit(token0, 'Transfer')
      .withArgs(indexPool.address, router.address, input_0)
      .to.emit(token0, 'Transfer')
      .withArgs(router.address, wallet.address, input_0)
      .to.emit(token1, 'Transfer')
      .withArgs(indexPool.address, router.address, input_1)
      .to.emit(token1, 'Transfer')
      .withArgs(router.address, pair_0_1_sushi.address, input_1)
      .to.emit(token0, 'Transfer')
      .withArgs(pair_0_1_sushi.address, wallet.address, output_1_0)
    })
  })

  describe('burnForAllTokensAndSwapForETH', () => {
    const poolIn = expandTo18Decimals(1)
    let input_0: BigNumber
    let input_1: BigNumber
    let output_0_weth: BigNumber
    let output_1_0: BigNumber
    let output_0_weth_1: BigNumber


    beforeEach(async () => {
      await addLiquidity();
      ([input_0, input_1] = allOutGivenPoolIn(poolIn));
      // weth -> token0
      output_0_weth = swapOutGivenIn(input_0, expandTo18Decimals(1000), expandTo18Decimals(1000))
      // token1 -> token0
      output_1_0 = swapOutGivenIn(input_1, expandTo18Decimals(1000), expandTo18Decimals(1000))
      // token1 -> token0 -> weth
      output_0_weth_1 = swapOutGivenIn(
        output_1_0,
        expandTo18Decimals(1000).add(input_0),
        expandTo18Decimals(1000).sub(output_0_weth)
      )
    })

    it('Pool -> Uni & Pool -> Sushi -> Uni', async () => {
      await indexPool.approve(router.address, poolIn)
      const balanceBefore = await ethers.provider.getBalance(wallet.address)
      const tx = router.burnForAllTokensAndSwapForETH(
        indexPool.address,
        [0, 0],
        [encodePathToken(constants.AddressZero, false), encodeIntermediary(token0.address, true, false)],
        poolIn,
        0
      )
      await expect(tx)
        .to.emit(indexPool, 'Transfer')
        .withArgs(wallet.address, router.address, poolIn)
        .to.emit(indexPool, 'Transfer')
        .withArgs(router.address, indexPool.address, poolIn)
        .to.emit(token0, 'Transfer')
        .withArgs(indexPool.address, router.address, input_0)
        .to.emit(token0, 'Transfer')
        .withArgs(router.address, pair_0_weth_uni.address, input_0)
        .to.emit(weth, 'Transfer')
        .withArgs(pair_0_weth_uni.address, router.address, output_0_weth)
        .to.emit(token1, 'Transfer')
        .withArgs(indexPool.address, router.address, input_1)
        .to.emit(token1, 'Transfer')
        .withArgs(router.address, pair_0_1_sushi.address, input_1)
        .to.emit(token0, 'Transfer')
        .withArgs(pair_0_1_sushi.address, pair_0_weth_uni.address, output_1_0)
        .to.emit(weth, 'Transfer')
        .withArgs(pair_0_weth_uni.address, router.address, output_0_weth_1)
        .to.emit(weth, 'Withdrawal')
        .withArgs(router.address, output_0_weth.add(output_0_weth_1))
      expect(
        await ethers.provider.getBalance(wallet.address)
      ).to.eq(
        balanceBefore
        .sub(await getTransactionCost(tx))
        .add(output_0_weth_1)
        .add(output_0_weth)
      )
    })
  })
})