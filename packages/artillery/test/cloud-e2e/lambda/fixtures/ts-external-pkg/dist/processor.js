var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === 'object') || typeof from === 'function') {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  return to;
};
var __toCommonJS = (mod) =>
  __copyProps(__defProp({}, '__esModule', { value: true }), mod);

// test/cloud-e2e/lambda/fixtures/ts-external-pkg/processor.ts
var processor_exports = {};
__export(processor_exports, {
  checkAddress: () => checkAddress
});
module.exports = __toCommonJS(processor_exports);
var import_zod = require('zod');
var AddressSchema = import_zod.z.object({
  street: import_zod.z.string(),
  city: import_zod.z.string(),
  number: import_zod.z.string(),
  postCode: import_zod.z.string(),
  country: import_zod.z.string()
});
var checkAddress = async (context, ee) => {
  const address = context.vars.address;
  const result = AddressSchema.safeParse(address);
  if (!result.success) {
    ee.emit('error', 'invalid_address');
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 &&
  (module.exports = {
    checkAddress
  });
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vcHJvY2Vzc29yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBAdHMtaWdub3JlXG5pbXBvcnQgeyB6IH0gZnJvbSAnem9kJztcblxuY29uc3QgQWRkcmVzc1NjaGVtYSA9IHoub2JqZWN0KHtcbiAgc3RyZWV0OiB6LnN0cmluZygpLFxuICBjaXR5OiB6LnN0cmluZygpLFxuICBudW1iZXI6IHouc3RyaW5nKCksXG4gIHBvc3RDb2RlOiB6LnN0cmluZygpLFxuICBjb3VudHJ5OiB6LnN0cmluZygpXG59KTtcblxuZXhwb3J0IGNvbnN0IGNoZWNrQWRkcmVzcyA9IGFzeW5jIChjb250ZXh0LCBlZSkgPT4ge1xuICBjb25zdCBhZGRyZXNzID0gY29udGV4dC52YXJzLmFkZHJlc3M7XG4gIGNvbnN0IHJlc3VsdCA9IEFkZHJlc3NTY2hlbWEuc2FmZVBhcnNlKGFkZHJlc3MpO1xuXG4gIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICBlZS5lbWl0KCdlcnJvcicsICdpbnZhbGlkX2FkZHJlc3MnKTtcbiAgfVxufTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQ0EsaUJBQWtCO0FBRWxCLElBQU0sZ0JBQWdCLGFBQUUsT0FBTztBQUFBLEVBQzdCLFFBQVEsYUFBRSxPQUFPO0FBQUEsRUFDakIsTUFBTSxhQUFFLE9BQU87QUFBQSxFQUNmLFFBQVEsYUFBRSxPQUFPO0FBQUEsRUFDakIsVUFBVSxhQUFFLE9BQU87QUFBQSxFQUNuQixTQUFTLGFBQUUsT0FBTztBQUNwQixDQUFDO0FBRU0sSUFBTSxlQUFlLE9BQU8sU0FBUyxPQUFPO0FBQ2pELFFBQU0sVUFBVSxRQUFRLEtBQUs7QUFDN0IsUUFBTSxTQUFTLGNBQWMsVUFBVSxPQUFPO0FBRTlDLE1BQUksQ0FBQyxPQUFPLFNBQVM7QUFDbkIsT0FBRyxLQUFLLFNBQVMsaUJBQWlCO0FBQUEsRUFDcEM7QUFDRjsiLAogICJuYW1lcyI6IFtdCn0K
