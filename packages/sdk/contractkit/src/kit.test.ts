import { StrongAddress } from '@celo/base'
import { CeloTx, CeloTxObject, CeloTxReceipt, PromiEvent } from '@celo/connect'
import { testWithAnvilL1 } from '@celo/dev-utils/lib/anvil-test'
import Web3 from 'web3'
import {
  ContractKit,
  newKitFromWeb3 as newFullKitFromWeb3,
  newKitFromWeb3,
  newKitWithApiKey,
} from './kit'
import { newKitFromWeb3 as newMiniKitFromWeb3 } from './mini-kit'
import { promiEventSpy } from './test-utils/PromiEventStub'

interface TransactionObjectStub<T> extends CeloTxObject<T> {
  sendMock: jest.Mock<PromiEvent<any>, [CeloTx | undefined]>
  estimateGasMock: jest.Mock<Promise<number>, []>
  resolveHash(hash: string): void
  resolveReceipt(receipt: CeloTxReceipt): void
  rejectHash(error: any): void
  rejectReceipt(receipt: CeloTxReceipt, error: any): void
}

export function txoStub<T>(): TransactionObjectStub<T> {
  const estimateGasMock = jest.fn()
  const peStub = promiEventSpy()
  const sendMock = jest.fn().mockReturnValue(peStub)

  const pe: TransactionObjectStub<T> = {
    arguments: [],
    call: () => {
      throw new Error('not implemented')
    },
    encodeABI: () => {
      throw new Error('not implemented')
    },
    estimateGas: estimateGasMock,
    send: sendMock,
    sendMock,
    estimateGasMock,
    resolveHash: peStub.resolveHash,
    rejectHash: peStub.rejectHash,
    resolveReceipt: peStub.resolveReceipt,
    rejectReceipt: peStub.resolveReceipt,
    _parent: jest.fn() as any,
  }
  return pe
}

;[newFullKitFromWeb3, newMiniKitFromWeb3].forEach((newKitFromWeb3) => {
  describe('kit.sendTransactionObject()', () => {
    const kit = newKitFromWeb3(new Web3('http://'))

    test('should send transaction on simple case', async () => {
      const txo = txoStub()
      txo.estimateGasMock.mockResolvedValue(1000)
      const txRes = await kit.connection.sendTransactionObject(txo)

      txo.resolveHash('HASH')
      txo.resolveReceipt('Receipt' as any)

      await expect(txRes.getHash()).resolves.toBe('HASH')
      await expect(txRes.waitReceipt()).resolves.toBe('Receipt')
    })

    test('should not estimateGas if gas is provided', async () => {
      const txo = txoStub()
      await kit.connection.sendTransactionObject(txo, { gas: 555 })
      expect(txo.estimateGasMock).not.toBeCalled()
    })

    test('should use inflation factor on gas', async () => {
      const txo = txoStub()
      txo.estimateGasMock.mockResolvedValue(1000)
      kit.connection.defaultGasInflationFactor = 2
      await kit.connection.sendTransactionObject(txo)
      expect(txo.send).toBeCalledWith(
        expect.objectContaining({
          gas: 1000 * 2,
        })
      )
    })

    test('should forward txoptions to txo.send()', async () => {
      const txo = txoStub()
      await kit.connection.sendTransactionObject(txo, { gas: 555, from: '0xAAFFF' })
      expect(txo.send).toBeCalledWith({
        feeCurrency: undefined,
        gas: 555,
        from: '0xAAFFF',
      })
    })

    test('works with maxFeePerGas and maxPriorityFeePerGas', async () => {
      const txo = txoStub()
      await kit.connection.sendTransactionObject(txo, {
        gas: 1000,
        maxFeePerGas: 555,
        maxPriorityFeePerGas: 555,
        from: '0xAAFFF',
      })
      expect(txo.send).toBeCalledWith({
        feeCurrency: undefined,
        maxFeePerGas: 555,
        maxPriorityFeePerGas: 555,
        gas: 1000,
        from: '0xAAFFF',
      })
    })

    test('when maxFeePerGas and maxPriorityFeePerGas and feeCurrency', async () => {
      const txo = txoStub()
      await kit.connection.sendTransactionObject(txo, {
        gas: 1000,
        maxFeePerGas: 555,
        maxPriorityFeePerGas: 555,
        feeCurrency: '0xe8537a3d056da446677b9e9d6c5db704eaab4787',
        from: '0xAAFFF',
      })
      expect(txo.send).toBeCalledWith({
        gas: 1000,
        maxFeePerGas: 555,
        maxPriorityFeePerGas: 555,
        feeCurrency: '0xe8537a3d056da446677b9e9d6c5db704eaab4787',
        from: '0xAAFFF',
      })
    })
  })
})

describe('newKitWithApiKey()', () => {
  test('should set apiKey in request header', async () => {
    jest.spyOn(Web3.providers, 'HttpProvider')

    newKitWithApiKey('http://', 'key')
    expect(Web3.providers.HttpProvider).toHaveBeenCalledWith('http://', {
      headers: [{ name: 'apiKey', value: 'key' }],
    })
  })
})

testWithAnvilL1('kit', (web3: Web3) => {
  let kit: ContractKit
  let accounts: string[]
  let feeToken: StrongAddress
  beforeAll(async () => {
    accounts = await web3.eth.getAccounts()
    kit = newKitFromWeb3(web3)

    const feeCurrencyWhitelist = await kit.contracts.getFeeCurrencyWhitelist()
    const gasOptions = await feeCurrencyWhitelist.getWhitelist()
    feeToken = gasOptions[0]
  })
  describe('Fetch whitelisted fee currencies', () => {
    describe('When whitelisted fee currencies are fetched on-chain', () => {
      test('Then the result includes addresses', async () => {
        const feeCurrencyWhitelist = await kit.contracts.getFeeCurrencyWhitelist()
        const gasOptions = await feeCurrencyWhitelist.getWhitelist()
        for (let i = 0; i < gasOptions.length; i++) {
          expect(web3.utils.isAddress(gasOptions[i])).toBeTruthy()
        }
      })

      test.failing('Then the resulting addresses are valid fee currencies', async () => {
        const celo = await kit.contracts.getGoldToken()
        const feeCurrencyWhitelist = await kit.contracts.getFeeCurrencyWhitelist()
        const gasOptions = await feeCurrencyWhitelist.getWhitelist()
        const sender = accounts[0]
        const recipient = accounts[1]
        const amount = kit.web3.utils.toWei('0.01', 'ether')

        for (let gasOption of gasOptions.filter((x) => x !== celo.address)) {
          const recipientBalanceBefore = await kit.getTotalBalance(recipient)
          const feeAsErc20 = await kit.contracts.getErc20(gasOption)
          // const transactionObject = celo.transfer(recipient, amount)
          const feeCurrencyBalanceBefore = await feeAsErc20.balanceOf(sender)
          await kit.connection.sendTransaction({
            from: sender,
            to: recipient,
            value: amount,
            feeCurrency: gasOption,
          })
          const recipientBalanceAfter = await kit.getTotalBalance(recipient)
          const feeCurrencyBalanceAfter = await feeAsErc20.balanceOf(sender)

          expect(recipientBalanceAfter.CELO!.eq(recipientBalanceBefore.CELO!.plus(amount))).toBe(
            true
          )

          // This is failing because celo-ganache doesn't support feeCurrency
          // https://github.com/celo-org/ganache-cli/tree/master
          expect(feeCurrencyBalanceBefore.isGreaterThan(feeCurrencyBalanceAfter)).toBe(true)
        }
      })

      test.failing('Then using a wrong address will fail', async () => {
        // This is failing because celo-ganache doesn't support feeCurrency
        // https://github.com/celo-org/ganache-cli/tree/master

        const sender = accounts[0]
        const recipient = accounts[1]
        const amount = kit.web3.utils.toWei('0.01', 'ether')
        await expect(
          kit.connection.sendTransaction({
            from: sender,
            to: recipient,
            value: amount,
            feeCurrency: '0123' as StrongAddress,
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot()
      })
    })
  })
  describe('populateMaxFeeInToken', () => {
    describe('when not on cel2', () => {
      it('throws not L2 error', async () => {
        await expect(
          kit.populateMaxFeeInToken({ feeCurrency: feeToken, gas: '10000000034230982772378193726' })
        ).rejects.toMatchInlineSnapshot(
          `[Error: Can't populate \`maxFeeInFeeCurrency\` if not on a CEL2 network]`
        )
      })
    })
    describe('estimateMaxFeeInFeeToken', () => {
      it('returns the right estimation (1/2)', async () => {
        const spy = jest.spyOn(await kit.contracts.getFeeCurrencyDirectory(), 'getExchangeRate')
        //@ts-expect-error
        spy.mockImplementation(() =>
          Promise.resolve({ numerator: BigInt(1), denominator: BigInt(2) })
        )

        await expect(
          kit.estimateMaxFeeInFeeToken({
            feeCurrency: feeToken,
            gasLimit: BigInt(10),
            maxFeePerGas: BigInt(10),
          })
          // 10 * 10 * 1.2 * 2
        ).resolves.toEqual(BigInt(204))
      })
      it('returns the right estimation (1/1)', async () => {
        const spy = jest.spyOn(await kit.contracts.getFeeCurrencyDirectory(), 'getExchangeRate')
        //@ts-expect-error
        spy.mockImplementation(() =>
          Promise.resolve({ numerator: BigInt(1), denominator: BigInt(1) })
        )

        await expect(
          kit.estimateMaxFeeInFeeToken({
            feeCurrency: feeToken,
            gasLimit: BigInt(10),
            maxFeePerGas: BigInt(10),
          })
          // 10 * 10 * 1.2 * 1
        ).resolves.toEqual(BigInt(102))
      })
    })

    it('returns the right estimation (1/1)', async () => {
      const spy = jest.spyOn(await kit.contracts.getFeeCurrencyDirectory(), 'getExchangeRate')
      //@ts-expect-error
      spy.mockImplementation(() =>
        Promise.resolve({ numerator: BigInt(2), denominator: BigInt(1) })
      )

      await expect(
        kit.estimateMaxFeeInFeeToken({
          feeCurrency: feeToken,
          gasLimit: BigInt(10),
          maxFeePerGas: BigInt(10),
        })
        // 10 * 10 * 1.2 * 1/2
      ).resolves.toEqual(BigInt(51))
    })
  })

  describe('epochs', () => {
    it('gets the current epoch size', async () => {
      expect(await kit.getEpochSize()).toEqual(100)
    })

    it('gets first and last block number of an epoch', async () => {
      expect(await kit.getFirstBlockNumberForEpoch(2)).toEqual(101)
      expect(await kit.getLastBlockNumberForEpoch(2)).toEqual(200)
    })

    it('gets the current epoch number', async () => {
      expect(await kit.getEpochNumberOfBlock(300)).toEqual(3)
    })
  })
})
