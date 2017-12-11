import Kleros from '../kleros'
import Web3 from 'web3'
import contract from 'truffle-contract'
import {LOCALHOST_PROVIDER} from '../../constants'
import config from '../../config'
import mockDisputes from '../../contract_wrapper/mockDisputes'


describe('Kleros', () => {
  let partyA
  let partyB
  let juror
  let other
  let web3
  let KlerosInstance
  let storeProvider

  beforeAll(async () => {
    // use testRPC
    const provider = await new Web3.providers.HttpProvider(LOCALHOST_PROVIDER)

    KlerosInstance = await new Kleros(provider)

    web3 = await new Web3(provider)

    partyA = web3.eth.accounts[0]
    partyB = web3.eth.accounts[1]
    juror = web3.eth.accounts[3]
    other = web3.eth.accounts[4]

    storeProvider = await KlerosInstance.getStoreWrapper()
  })

  beforeEach(async () => {
    // reset user profile in store
    await storeProvider.newUserProfile(partyA, {address: partyA})
    await storeProvider.newUserProfile(partyB, {address: partyB})
    await storeProvider.newUserProfile(juror, {address: juror})
    await storeProvider.newUserProfile(other, {address: other})
  })

  test('deploy a arbitrableTransaction contract', async () => {
    // initialize Kleros
    const rngInstance = await KlerosInstance.blockHashRng.deploy(
      undefined
    )
    expect(rngInstance.transactionHash)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    const pinakionInstance = await KlerosInstance.pinakion.deploy()
    expect(pinakionInstance.transactionHash)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    // initialize KlerosPOC
    const klerosCourt = await KlerosInstance.klerosPOC.deploy(
      rngInstance.address,
      pinakionInstance.address
    )
    expect(klerosCourt.transactionHash)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash


    const mockHash = 'mock-hash-contract'
    const mockTimeout = 1
    const mockArbitratorExtraData = ''
    const mockEmail = 'test@kleros.io'
    const mockDescription = 'test description'
    let contractArbitrableTransactionData = await KlerosInstance.arbitrableContract
      .deployContract(
        partyA,
        undefined, // use default value (0)
        mockHash,
        klerosCourt.address,
        mockTimeout,
        partyB,
        mockArbitratorExtraData,
        mockEmail,
        mockDescription
      )

    expect(contractArbitrableTransactionData.address)
      .toBeDefined() // contract address
    expect(contractArbitrableTransactionData.arbitrator)
      .toEqual(klerosCourt.address)
    expect(contractArbitrableTransactionData.partyA)
      .toEqual(partyA)
    expect(contractArbitrableTransactionData.partyB)
      .toEqual(partyB)
  }, 10000)

  test('KlerosPOC dispute resolution flow', async () => {
    // initialize RNG and Pinakion contracts
    const rngInstance = await KlerosInstance.blockHashRng.deploy(
      undefined
    )
    expect(rngInstance.transactionHash)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    const pinakionInstance = await KlerosInstance.pinakion.deploy()
    expect(pinakionInstance.transactionHash)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    // initialize KlerosPOC
    const klerosCourt = await KlerosInstance.klerosPOC.deploy(
      rngInstance.address,
      pinakionInstance.address
    )
    expect(klerosCourt.transactionHash)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    // transfer ownership and set kleros instance
    const setKlerosHash = await KlerosInstance.pinakion.setKleros(
      pinakionInstance.address,
      klerosCourt.address
    )
    expect(setKlerosHash)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    const transferOwnershipHash = await KlerosInstance.pinakion.transferOwnership(
      pinakionInstance.address,
      klerosCourt.address
    )
    expect(transferOwnershipHash)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    const pnkData = await KlerosInstance.pinakion.getData(pinakionInstance.address)
    expect(pnkData.owner).toEqual(klerosCourt.address)
    expect(pnkData.kleros).toEqual(klerosCourt.address)

    // set instance of kleros court for assertions
    const klerosPOCInstance = await KlerosInstance.klerosPOC.load(klerosCourt.address)

    // Juror should have no balance to start with
    const initialBalance = await KlerosInstance.arbitrator.getPNKBalance(klerosCourt.address, juror)
    expect(initialBalance.tokenBalance).toEqual('0')

    // buy 1 PNK
    const newBalance = await KlerosInstance.arbitrator.buyPNK(1, klerosCourt.address, juror)
    expect(newBalance.tokenBalance).toEqual('1')

    // activate PNK
    const activatedTokenAmount = 0.5
    const balance = await KlerosInstance.arbitrator.activatePNK(activatedTokenAmount, klerosCourt.address, juror)
    expect(balance.tokenBalance).toEqual('1')
    expect(balance.activatedTokens).toEqual('0.5')

    const jurorData = await klerosPOCInstance.jurors(juror)
    expect(jurorData[2].toNumber()).toEqual((await klerosPOCInstance.session()).toNumber())
    expect((jurorData[4].toNumber() - jurorData[3].toNumber())).toEqual(parseInt(web3.toWei(activatedTokenAmount, 'ether')))

    // deploy a contract and create dispute
    const mockHash = 'mock-hash-contract'
    const mockTimeout = 1
    const mockArbitratorExtraData = ''
    const mockEmail = 'test@kleros.io'
    const mockDescription = 'test description'
    const contractPaymentAmount = web3.toWei(1, 'ether') // contract payment be 1 ether
    let contractArbitrableTransactionData = await KlerosInstance.arbitrableContract
      .deployContract(
        partyA,
        contractPaymentAmount, // use default value (0)
        mockHash,
        klerosCourt.address,
        mockTimeout,
        partyB,
        mockArbitratorExtraData,
        mockEmail,
        mockDescription
      )

    expect(contractArbitrableTransactionData.address)
      .toBeDefined() // contract address
    expect(contractArbitrableTransactionData.arbitrator)
      .toEqual(klerosCourt.address)
    expect(contractArbitrableTransactionData.partyA)
      .toEqual(partyA)
    expect(contractArbitrableTransactionData.partyB)
      .toEqual(partyB)

    // return a bigint
    // FIXME use arbitrableTransaction
    const arbitrableContractInstance = await KlerosInstance.arbitrableTransaction.load(contractArbitrableTransactionData.address)
    const partyAFeeContractInstance = await arbitrableContractInstance
      .partyAFee()

    // return bytes
    // FIXME use arbitrableTransaction
    let extraDataContractInstance = await arbitrableContractInstance
      .arbitratorExtraData()

    // return a bigint with the default value : 10000 wei fees
    const arbitrationCost = await klerosCourt
      .arbitrationCost(extraDataContractInstance)

    // raise dispute party A
    const txHashRaiseDisputeByPartyA = await KlerosInstance.disputes
      .raiseDisputePartyA(
        partyA,
        contractArbitrableTransactionData.address,
        web3.fromWei(
          arbitrationCost - partyAFeeContractInstance.toNumber(), 'ether'
        )
      )
    expect(txHashRaiseDisputeByPartyA)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    // return a bigint
    // FIXME use arbitrableTransaction
    const partyBFeeContractInstance = await arbitrableContractInstance
      .partyBFee()

    const txHashRaiseDisputeByPartyB = await KlerosInstance.disputes
      .raiseDisputePartyB(
        partyB,
        contractArbitrableTransactionData.address,
        web3.fromWei(
          arbitrationCost - partyBFeeContractInstance.toNumber(), 'ether'
        )
      )
    expect(txHashRaiseDisputeByPartyB)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    // check to see if store is updated
    const userProfile = await storeProvider.getUserProfile(partyA)
    expect(userProfile.disputes.length).toEqual(1)

    const dispute = await KlerosInstance.klerosPOC.getDispute(klerosCourt.address, 0)
    expect(dispute.arbitratedContract).toEqual(contractArbitrableTransactionData.address)
    expect(dispute.firstSession).toEqual((await klerosPOCInstance.session()).toNumber())
    expect(dispute.numberOfAppeals).toEqual(0)

    // add an evidence for partyA
    // FIXME use arbitrableTransaction
    const testName = 'test name'
    const testDesc = 'test description'
    const testURL = 'http://test.com'
    const txHashAddEvidence = await KlerosInstance.arbitrableContract
      .submitEvidence(
        partyA,
        contractArbitrableTransactionData.address,
        testName,
        testDesc,
        testURL
      )
    expect(txHashAddEvidence)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    let contracts = await KlerosInstance.arbitrator.getContractsForUser(partyA)
    expect(contracts).toBeTruthy()

    const contractStoreData = await KlerosInstance.arbitrableContract
      .getData(contractArbitrableTransactionData.address, partyA)

    expect(contractStoreData.evidences[0].url)
      .toBe(testURL)

    // check initial state of contract
    // FIXME var must be more explicit
    const initialState = await KlerosInstance.arbitrator.getData(klerosCourt.address)
    expect(initialState.session).toEqual(1)
    expect(initialState.period).toEqual(0)

    const delaySecond = async () => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve(true)
        }, 1000)
      })
    }

    let newState
    // pass state so jurors are selected
    for (let i=1; i<3; i++) {
      // NOTE we need to make another block before we can generate the random number. Should not be an issue on main nets where avg block time < period length
      if (i == 2) web3.eth.sendTransaction({from: partyA, to: partyB, value: 10000, data: '0x'})
      // delay a second so period is eligible to be passed
      await delaySecond()
      newState = await KlerosInstance.arbitrator.passPeriod(klerosCourt.address, other)
      expect(newState.period).toEqual(i)
    }
    const randomNumber = (await klerosPOCInstance.randomNumber()).toNumber()
    const shouldBeJuror = await klerosPOCInstance.isDrawn(0, juror, 1)

    const disputesForJuror = await KlerosInstance.disputes.getDisputesForUser(klerosCourt.address, juror)
    expect(disputesForJuror.length).toEqual(1)
    expect(disputesForJuror[0].arbitrableContractAddress).toEqual(contractArbitrableTransactionData.address)
    expect(disputesForJuror[0].votes).toEqual([1,2,3])

    // partyA wins
    const ruling = 1
    const submitTxHash = await KlerosInstance.disputes.submitVotesForDispute(
      klerosCourt.address,
      0,
      ruling,
      [1],
      contractArbitrableTransactionData.address, // FIXME using address for hash right now
      juror
    )

    expect(submitTxHash)
      .toEqual(expect.stringMatching(/^0x[a-f0-9]{64}$/)) // tx hash

    // delay 1 second
    await delaySecond()
    // move to appeal period
    await KlerosInstance.arbitrator.passPeriod(klerosCourt.address, other)

    const currentRuling = await klerosCourt.currentRuling(0)
    expect(`${currentRuling}`).toEqual(`${ruling}`)

    contracts = await KlerosInstance.arbitrator.getContractsForUser(partyA)
    expect(contracts).toBeTruthy()

    // TODO test appeal

    // delay 1 second
    await delaySecond()
    // move to execute period
    await KlerosInstance.arbitrator.passPeriod(klerosCourt.address, other)
    // balances before ruling is executed
    const partyABalance = web3.eth.getBalance(partyA).toNumber()
    const partyBBalance = web3.eth.getBalance(partyB).toNumber()
    // repartition tokens
    await KlerosInstance.klerosPOC.repartitionJurorTokens(klerosCourt.address, 0, other)
    // execute ruling
    await KlerosInstance.klerosPOC.executeRuling(klerosCourt.address, 0, other)
    // balances after ruling
    // partyA wins so they should recieve their arbitration fee as well as the value locked in contract
    expect(web3.eth.getBalance(partyA).toNumber() - partyABalance).toEqual(arbitrationCost.toNumber() + parseInt(contractPaymentAmount))
    // partyB lost so their balance should remain the same
    expect(web3.eth.getBalance(partyB).toNumber()).toEqual(partyBBalance)

    const updatedContractData = await KlerosInstance.arbitrableContract.getData(contractArbitrableTransactionData.address)
    expect(parseInt(updatedContractData.status)).toEqual(4)
  }, 50000)
})
