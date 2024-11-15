import chalk from 'chalk'
import { BaseCommand } from '../../base'
import { displaySendTx } from '../../utils/cli'
import { CustomFlags } from '../../utils/command'

export default class Finish extends BaseCommand {
  static description = 'Finishes next epoch process.'

  static flags = {
    ...BaseCommand.flags,
    from: CustomFlags.address({ required: true }),
  }

  static args = {}

  static examples = ['finish --from 0x47e172F6CfB6c7D01C1574fa3E2Be7CC73269D95']

  async run() {
    const kit = await this.getKit()
    const res = await this.parse(Finish)
    const address = res.flags.from

    kit.defaultAccount = address

    const epochManager = await kit.contracts.getEpochManager()

    const isEpochProcessStarted = await epochManager.isOnEpochProcess()
    if (!isEpochProcessStarted) {
      const msg = 'Epoch process is not started yet'
      console.info(chalk.red.bold(msg))
      return msg
    }

    await displaySendTx('finishNextEpoch', await epochManager.finishNextEpochProcessTx())
  }
}