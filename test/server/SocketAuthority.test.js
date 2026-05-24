const { expect } = require('chai')
const { Sequelize } = require('sequelize')
const sinon = require('sinon')

const Database = require('../../server/Database')
const Logger = require('../../server/Logger')
const SocketAuthority = require('../../server/SocketAuthority')

describe('SocketAuthority - User Message Consent Events', () => {
  beforeEach(async () => {
    global.ServerSettings = {}
    Database.sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    Database.sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    await Database.buildModels()

    SocketAuthority.clients = {}

    sinon.stub(Logger, 'warn')
    sinon.stub(Logger, 'info')
    sinon.stub(Logger, 'error')
    sinon.stub(Logger, 'debug')
  })

  afterEach(async () => {
    sinon.restore()
    SocketAuthority.clients = {}
    await Database.sequelize.sync({ force: true })
  })

  function createFakeSocket(id) {
    return {
      id,
      emit: sinon.spy()
    }
  }

  it('should deliver user messages only when consent is mutual', async () => {
    const sender = await Database.userModel.create({
      username: 'sender-user',
      pash: 'hashed_password_1',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    const recipient = await Database.userModel.create({
      username: 'recipient-user',
      pash: 'hashed_password_2',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    await sender.addUserMessageConsent(recipient.id)
    await recipient.addUserMessageConsent(sender.id)

    const senderSocket = createFakeSocket('sender-socket')
    const recipientSocket = createFakeSocket('recipient-socket')

    SocketAuthority.clients[senderSocket.id] = {
      id: senderSocket.id,
      socket: senderSocket,
      connected_at: Date.now(),
      user: sender
    }
    SocketAuthority.clients[recipientSocket.id] = {
      id: recipientSocket.id,
      socket: recipientSocket,
      connected_at: Date.now(),
      user: recipient
    }

    await SocketAuthority.handleUserMessage(senderSocket, {
      userId: recipient.id,
      message: 'Hello from sender',
      client: 'abs-mobile',
      clientVersion: 184,
      clientId: 'com.example.abs.mobile',
      sender: {
        id: 'spoofed-id',
        username: 'spoofed-user',
        type: 'admin'
      }
    })

    expect(recipientSocket.emit.calledOnce).to.be.true
    const [eventName, payload] = recipientSocket.emit.firstCall.args
    expect(eventName).to.equal('user_message')
    expect(payload.message).to.equal('Hello from sender')
    expect(payload.sender).to.deep.equal({
      id: sender.id,
      username: sender.username,
      type: sender.type
    })
    expect(payload.client).to.deep.equal({
      client: 'abs-mobile',
      clientVersion: 184,
      clientId: 'com.example.abs.mobile'
    })

    expect(senderSocket.emit.calledWithMatch('user_message_sent', { userId: recipient.id })).to.be.true
  })

  it('should reject guests sending message_user events', async () => {
    const guestSender = await Database.userModel.create({
      username: 'guest-user',
      pash: 'hashed_password_1',
      type: 'guest',
      isActive: true,
      extraData: {}
    })

    const recipient = await Database.userModel.create({
      username: 'recipient-user',
      pash: 'hashed_password_2',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    const guestSocket = createFakeSocket('guest-socket')
    const recipientSocket = createFakeSocket('recipient-socket')

    SocketAuthority.clients[guestSocket.id] = {
      id: guestSocket.id,
      socket: guestSocket,
      connected_at: Date.now(),
      user: guestSender
    }
    SocketAuthority.clients[recipientSocket.id] = {
      id: recipientSocket.id,
      socket: recipientSocket,
      connected_at: Date.now(),
      user: recipient
    }

    await SocketAuthority.handleUserMessage(guestSocket, {
      userId: recipient.id,
      message: 'Should fail'
    })

    expect(recipientSocket.emit.called).to.be.false
    expect(guestSocket.emit.calledWithMatch('user_message_error', { code: 'forbidden' })).to.be.true
  })

  it('should reject non-string client metadata', async () => {
    const sender = await Database.userModel.create({
      username: 'sender-user',
      pash: 'hashed_password_1',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    const recipient = await Database.userModel.create({
      username: 'recipient-user',
      pash: 'hashed_password_2',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    await sender.addUserMessageConsent(recipient.id)
    await recipient.addUserMessageConsent(sender.id)

    const senderSocket = createFakeSocket('sender-socket')
    const recipientSocket = createFakeSocket('recipient-socket')

    SocketAuthority.clients[senderSocket.id] = {
      id: senderSocket.id,
      socket: senderSocket,
      connected_at: Date.now(),
      user: sender
    }
    SocketAuthority.clients[recipientSocket.id] = {
      id: recipientSocket.id,
      socket: recipientSocket,
      connected_at: Date.now(),
      user: recipient
    }

    await SocketAuthority.handleUserMessage(senderSocket, {
      userId: recipient.id,
      message: 'Hello from sender',
      client: { bad: true }
    })

    expect(recipientSocket.emit.called).to.be.false
    expect(senderSocket.emit.calledWithMatch('user_message_error', { code: 'invalid_payload' })).to.be.true
  })

  it('should reject non-numeric clientVersion metadata', async () => {
    const sender = await Database.userModel.create({
      username: 'sender-user',
      pash: 'hashed_password_1',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    const recipient = await Database.userModel.create({
      username: 'recipient-user',
      pash: 'hashed_password_2',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    await sender.addUserMessageConsent(recipient.id)
    await recipient.addUserMessageConsent(sender.id)

    const senderSocket = createFakeSocket('sender-socket')
    const recipientSocket = createFakeSocket('recipient-socket')

    SocketAuthority.clients[senderSocket.id] = {
      id: senderSocket.id,
      socket: senderSocket,
      connected_at: Date.now(),
      user: sender
    }
    SocketAuthority.clients[recipientSocket.id] = {
      id: recipientSocket.id,
      socket: recipientSocket,
      connected_at: Date.now(),
      user: recipient
    }

    await SocketAuthority.handleUserMessage(senderSocket, {
      userId: recipient.id,
      message: 'Hello from sender',
      clientVersion: '1.2.3'
    })

    expect(recipientSocket.emit.called).to.be.false
    expect(senderSocket.emit.calledWithMatch('user_message_error', { code: 'invalid_payload' })).to.be.true
  })

  it('should allow sending to self without consent', async () => {
    const sender = await Database.userModel.create({
      username: 'sender-user',
      pash: 'hashed_password_1',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    const senderSocket = createFakeSocket('sender-socket')
    SocketAuthority.clients[senderSocket.id] = {
      id: senderSocket.id,
      socket: senderSocket,
      connected_at: Date.now(),
      user: sender
    }

    await SocketAuthority.handleUserMessage(senderSocket, {
      userId: sender.id,
      message: 'Self message'
    })

    const userMessageCall = senderSocket.emit.getCalls().find((call) => call.args[0] === 'user_message')
    expect(userMessageCall).to.exist
    expect(userMessageCall.args[1]).to.include({ message: 'Self message' })
    expect(senderSocket.emit.calledWithMatch('user_message_sent', { userId: sender.id })).to.be.true
  })

  it('should reject sends when consent is not mutual', async () => {
    const sender = await Database.userModel.create({
      username: 'sender-user',
      pash: 'hashed_password_1',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    const recipient = await Database.userModel.create({
      username: 'recipient-user',
      pash: 'hashed_password_2',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    await sender.addUserMessageConsent(recipient.id)

    const senderSocket = createFakeSocket('sender-socket')
    const recipientSocket = createFakeSocket('recipient-socket')

    SocketAuthority.clients[senderSocket.id] = {
      id: senderSocket.id,
      socket: senderSocket,
      connected_at: Date.now(),
      user: sender
    }
    SocketAuthority.clients[recipientSocket.id] = {
      id: recipientSocket.id,
      socket: recipientSocket,
      connected_at: Date.now(),
      user: recipient
    }

    await SocketAuthority.handleUserMessage(senderSocket, {
      userId: recipient.id,
      message: 'Blocked message'
    })

    expect(recipientSocket.emit.called).to.be.false
    expect(senderSocket.emit.calledWithMatch('user_message_error', { code: 'delivery_not_allowed' })).to.be.true
  })

  it('should not reveal blocked state to requester', async () => {
    const sender = await Database.userModel.create({
      username: 'blocked-sender',
      pash: 'hashed_password_1',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    const recipient = await Database.userModel.create({
      username: 'recipient-user',
      pash: 'hashed_password_2',
      type: 'user',
      isActive: true,
      extraData: {}
    })

    await sender.addUserMessageConsent(recipient.id)
    await recipient.addUserMessageConsent(sender.id)
    await recipient.addUserMessageBlockedUser(sender.id)

    const senderSocket = createFakeSocket('sender-socket')
    const recipientSocket = createFakeSocket('recipient-socket')

    SocketAuthority.clients[senderSocket.id] = {
      id: senderSocket.id,
      socket: senderSocket,
      connected_at: Date.now(),
      user: sender
    }
    SocketAuthority.clients[recipientSocket.id] = {
      id: recipientSocket.id,
      socket: recipientSocket,
      connected_at: Date.now(),
      user: recipient
    }

    await SocketAuthority.handleUserMessage(senderSocket, {
      userId: recipient.id,
      message: 'Should not deliver'
    })

    expect(recipientSocket.emit.called).to.be.false
    expect(senderSocket.emit.calledWithMatch('user_message_error', { code: 'delivery_not_allowed' })).to.be.true
  })
})
