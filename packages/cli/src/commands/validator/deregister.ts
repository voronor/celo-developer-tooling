import { BaseCommand } from '../../base'
import { newCheckBuilder } from '../../utils/checks'
import { displaySendTx } from '../../utils/cli'
import { CustomFlags } from '../../utils/command'

export default class ValidatorDeregister extends BaseCommand {
  // TODO time period to deregister might have changed for L2 consider adding a wait to show the actual
  static description =
    "Deregister a Validator. Approximately 60 days after the validator is no longer part of any group, it will be possible to deregister the validator and start unlocking the CELO. If you wish to deregister your validator, you must first remove it from it's group, such as by deaffiliating it, then wait the required 60 days before running this command."

  static flags = {
    ...BaseCommand.flags,
    from: CustomFlags.address({ required: true, description: "Signer or Validator's address" }),
  }

  static examples = ['deregister --from 0x47e172f6cfb6c7d01c1574fa3e2be7cc73269d95']

  async run() {
    const kit = await this.getKit()
    const res = await this.parse(ValidatorDeregister)

    const validators = await kit.contracts.getValidators()

    await newCheckBuilder(this, res.flags.from)
      .isSignerOrAccount()
      .canSignValidatorTxs()
      .signerAccountIsValidator()
      .isNotValidatorGroupMember()
      .validatorDeregisterDurationPassed()
      .runChecks()

    const validator = await validators.signerToAccount(res.flags.from)
    await displaySendTx('deregister', await validators.deregisterValidator(validator))
  }
}
