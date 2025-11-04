// @ts-expect-error
import { z } from 'zod';

const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  number: z.string(),
  postCode: z.string(),
  country: z.string()
});

export const checkAddress = async (context, ee) => {
  const address = context.vars.address;
  const result = AddressSchema.safeParse(address);

  if (!result.success) {
    ee.emit('error', 'invalid_address');
  }
};
