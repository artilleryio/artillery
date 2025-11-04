function setId(context, _ee, next) {
    //Change your function name and add your logic here.
    //For more information, check: https://artillery.io/docs/http-reference/#function-signatures
    context.vars.artilleryTestId = "myTestId123"
    next();
};

module.exports = {
    setId
}