var inputelffile, outputlogfile;
var is_breakpoint = instructions[0].Break;
var pc_sail = crex_findReg_bytag("program_counter");
var last_execution_mode_run = -1;
var Module = typeof Module != "undefined" ? Module : {};
var moduleOverrides = Object.assign({}, Module);
var arguments_ = [];
var thisProgram = "./this.program";

var quit_ = (status, toThrow) => {
  throw toThrow;
};
var ENVIRONMENT_IS_WEB = true;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
if (Module["ENVIRONMENT"]) {
  throw new Error(
    "Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -s ENVIRONMENT=web or -s ENVIRONMENT=node)",
  );
}
var scriptDirectory = "";
function locateFile(path) {
  if (Module["locateFile"]) {
    return Module["locateFile"](path, scriptDirectory);
  }
  return scriptDirectory + path;
}
var read_, readAsync, readBinary, setWindowTitle;
function logExceptionOnExit(e) {
  if (e instanceof ExitStatus) return;
  let toLog = e;
  if (e && typeof e == "object" && e.stack) {
    toLog = [e, e.stack];
  }
  err("exiting due to exception: " + toLog);
}
if (ENVIRONMENT_IS_SHELL) {
  if (
    (typeof process == "object" && typeof require === "function") ||
    typeof window == "object" ||
    typeof importScripts == "function"
  )
    throw new Error(
      "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)",
    );
  if (typeof read != "undefined") {
    read_ = function shell_read(f) {
      return read(f);
    };
  }
  readBinary = function readBinary(f) {
    let data;
    if (typeof readbuffer == "function") {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, "binary");
    assert(typeof data == "object");
    return data;
  };
  readAsync = function readAsync(f, onload, onerror) {
    setTimeout(() => onload(readBinary(f)), 0);
  };
  if (typeof scriptArgs != "undefined") {
    arguments_ = scriptArgs;
  } else if (typeof arguments != "undefined") {
    arguments_ = arguments;
  }
  if (typeof quit == "function") {
    quit_ = (status, toThrow) => {
      logExceptionOnExit(toThrow);
      quit(status);
    };
  }
  if (typeof print != "undefined") {
    if (typeof console == "undefined") console = {};
    console.log = print;
    console.warn = console.error =
      typeof printErr != "undefined" ? printErr : print;
  }
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) {
    scriptDirectory = self.location.href;
  } else if (typeof document != "undefined" && document.currentScript) {
    scriptDirectory = document.currentScript.src;
  }
  if (scriptDirectory.indexOf("blob:") !== 0) {
    scriptDirectory = scriptDirectory.substr(
      0,
      scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1,
    );
  } else {
    scriptDirectory = "";
  }
  if (!(typeof window == "object" || typeof importScripts == "function"))
    throw new Error(
      "not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)",
    );
  {
    read_ = (url) => {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, false);
      xhr.send(null);
      return xhr.responseText;
    };
    if (ENVIRONMENT_IS_WORKER) {
      readBinary = (url) => {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.responseType = "arraybuffer";
        xhr.send(null);
        return new Uint8Array(xhr.response);
      };
    }
    readAsync = (url, onload, onerror) => {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      xhr.onload = () => {
        if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
          onload(xhr.response);
          return;
        }
        onerror();
      };
      xhr.onerror = onerror;
      xhr.send(null);
    };
  }
  setWindowTitle = (title) => (document.title = title);
} else {
  throw new Error("environment detection error");
}





// const instructionExp = /\[(\d+)\] \[(\w+)\]: 0x([0-9A-Fa-f]+) \(0x([0-9A-Fa-f]+)\) (\w+) ([^,]+), ([^,]+)(?:, (.+))?/;
var instructionExp = /\[(\d+)\] \[(\w+)\]: 0x([0-9A-Fa-f]+) \(0x([0-9A-Fa-f]+)\) (\w+)(?: ([^,]+), ([^,]+)(?:, (.+))?)?/;
var registerExp = /(x\d+) (<-) 0x([0-9A-Fa-f]+)/; // /(x\d+) (<-|->) 0x([0-9A-Fa-f]+)/;
var vectorExp = /(v\d+) (<-) 0x([0-9A-Fa-f]+)/;
var memoryExp = /mem\[0x([0-9A-Fa-f]+)\]\s*(<-|->)\s*0x([0-9A-Fa-f]+)/;
var CSRTypeExp = /(CSR\S*)\s+(\S+)\s+(\S+)\s+(0x)([\dA-Fa-f]{1,8})/;
var CSRExp = /^(CSR)\s+(\w+)\s+(<-|->)\s+0x([0-9a-fA-F]+)(?:\s+(.*))?$/;
// var displayExp = /^[A-Za-z\s]+:\s*(.*)$/;
var displayExp = /^([\w\s]+):\s*(.*)$/;       
var userMode = false;
var instoper = "";
var syscall_print_code = -1;
var prev_add_to_jump;
Module['print'] = function (message) {

  var next_add_to_jump;
  let instMatch   = message.match(instructionExp);
  let regiMatch   = message.match(registerExp);
  let memoMatch   = message.match(memoryExp);
  let printMatch  = message.match(displayExp);
  let CSRMatch    = message.match(CSRTypeExp); 
  let CSREMatch   = message.match(CSRExp);
  let vectorMatch = message.match(vectorExp);

  if(CSREMatch){
    console.log(CSREMatch);
    if (CSREMatch[2] !== "vtype" && CSREMatch[2] !== "vl"){
      let regtowrite = crex_findReg(CSREMatch[2]);
      if(regtowrite.match !== 0)
        writeRegister(CSREMatch[4], regtowrite.indexComp, regtowrite.indexElem);
    }
  }
  if (CSRMatch){
    // console.log(CSRMatch);
    if (CSRMatch[2] === "vtype"){
      var size_elem = parseInt(CSRMatch[5], 16).toString(2).padStart(32, '0');
      size_elem = size_elem.slice(26, 29);
      console.log("Tamaño: ", size_elem);
      if(size_elem === "000"){
        length_vext = 8;
        architecture.components[3].total_elements = 64;
      } else if (size_elem === "001") {
        length_vext = 16;
        architecture.components[3].total_elements = 32;
      } else if (size_elem === "010"){
        length_vext = 32;
        architecture.components[3].total_elements = 16;
      }else {
        length_vext = 64;
        architecture.components[3].total_elements = 8;
      }
      architecture.components[3].length_elem = length_vext;
    }
    else if (CSRMatch[2] === "vl"){
      architecture.components[3].elems_op = parseInt(CSRMatch[5], 16);
    }
  }
  if (vectorMatch){
    let regtowrite = crex_findReg(vectorMatch[1]);
    writeRegister(vectorMatch[3], regtowrite.indexComp, regtowrite.indexElem);
  }
  if (instMatch && instMatch[2] === 'U'){

    //Actualizamos el pc
    writeRegister(parseInt(instMatch[3], 16), pc_sail.indexComp, pc_sail.indexElem);
    // console.log("PC actual:",pc_sail);

    userMode = true;
    console.log("Instruccion: ", instMatch);
    const current_ins = instructions.findIndex(insn => insn.Address === ("0x"+instMatch[3].toLowerCase()));
    if(prev_add_to_jump !== undefined){
      instructions[prev_add_to_jump]._rowVariant = "";
      prev_add_to_jump = undefined;
    }

    if (instructions[current_ins].loaded.includes("jalr")){
      var next_add = instructions[current_ins].loaded.split("\t");
      const match = next_add[1].match(/(-?\d+)\((\w+)\)/);
      var aux_reg = crex_findReg(match[2]);
      var aux_val = readRegister(aux_reg.indexComp, aux_reg.indexElem);
      
      next_add_to_jump = (aux_val + parseInt(match[1], 10)).toString(16);
      next_add_to_jump = instructions.findIndex(insn => insn.Address === ("0x"+next_add_to_jump.toLowerCase()));
      prev_add_to_jump = current_ins;



      console.log("Siguiente direccion del jalr: ", next_add);
    }else if (instructions[current_ins].loaded.includes("jal")){
      var next_add = instructions[current_ins].loaded.split("\t");
      console.log("Siguiente direccion del jal: ", next_add);

    }else if (instructions[current_ins].loaded.includes("ret")){
      // Mirar el ra
      var aux_reg = crex_findReg("ra");
      next_add_to_jump = readRegister(aux_reg.indexComp, aux_reg.indexElem).toString(16);
      next_add_to_jump = instructions.findIndex(insn => insn.Address === ("0x"+next_add_to_jump.toLowerCase()));
      prev_add_to_jump = current_ins;
    }


    // Primero caso de paso a paso
    if (execution_mode_run === 1){
      instructions[current_ins]._rowVariant = 'info';
      if (current_ins < instructions.length - 1 || next_add_to_jump !== undefined){
        instructions[(next_add_to_jump !== undefined) ? next_add_to_jump : (current_ins + 1)]._rowVariant = 'success';
        is_breakpoint = instructions[(next_add_to_jump !== undefined) ? next_add_to_jump : (current_ins + 1)].Break;
      }
      if (current_ins > 0 || prev_add_to_jump !== undefined)
        instructions[(prev_add_to_jump !== undefined && prev_add_to_jump !== current_ins) ? prev_add_to_jump : (current_ins -1)]._rowVariant = '';
    }
    // Para el caso de run without stop y la siguiente instruccion es un breakpoint
    else if (execution_mode_run === 0){
      if (current_ins < instructions.length - 1 || next_add_to_jump !== undefined) {
        is_breakpoint = instructions[(next_add_to_jump !== undefined) ? next_add_to_jump : (current_ins + 1)].Break;
      }
      if(is_breakpoint){
        instructions[current_ins]._rowVariant = 'info';
        if (current_ins < instructions.length - 1  || next_add_to_jump !== undefined) {
          instructions[(next_add_to_jump !== undefined) ? next_add_to_jump : (current_ins + 1)]._rowVariant = 'success';
        }
      }else {
        instructions[current_ins]._rowVariant = '';
      }
      if (current_ins > 0  || prev_add_to_jump !== undefined)
        instructions[(prev_add_to_jump !== undefined && prev_add_to_jump !== current_ins) ? prev_add_to_jump : (current_ins -1)]._rowVariant = '';

    }
    else
      instructions[current_ins]._rowVariant = '';
    
    if (instMatch[5] === "ecall"){
      // if(execution_mode_run = 0){
      //   instructions[current_ins]._rowVariant = "info";
      //   if (current_ins < instructions.length -1)
      //     instructions[current_ins +1]._rowVariant = "success";
      // }
      let argument_register = crex_findReg("a7"); // obtenemos el registro para ver que llamada al sistema es
      let syscall_code = readRegister(argument_register.indexComp, argument_register.indexElem); // Lectura del registro para obtener el valor
  
      switch(syscall_code){
        case 5:
          if(execution_mode_run === 0){
            insn_number = current_ins;
            instructions[current_ins]._rowVariant = "info";
            if (current_ins < instructions.length -1  || next_add_to_jump !== undefined)
              instructions[(next_add_to_jump !== undefined) ? next_add_to_jump : (current_ins + 1)]._rowVariant = 'success';
              // instructions[current_ins +1]._rowVariant = "success";
          }
          // last_execution_mode_run = execution_mode_run;
          // execution_mode_run = 2;
          // Manejo para enteros
          capi_read_int('a0');
          break;
        case 6:
          if(execution_mode_run === 0){
            insn_number = current_ins;
            instructions[current_ins]._rowVariant = "info";
            if (current_ins < instructions.length -1 || next_add_to_jump !== undefined)
              instructions[(next_add_to_jump !== undefined) ? next_add_to_jump : (current_ins + 1)]._rowVariant = 'success';
        
              // instructions[current_ins +1]._rowVariant = "success";
          }
          // last_execution_mode_run = execution_mode_run;
          // execution_mode_run = 2;
          // Manejo para floats
          capi_read_float('fa0');
          break;
        case 7:
          if(execution_mode_run === 0){
            insn_number = current_ins;
            instructions[current_ins]._rowVariant = "info";
            if (current_ins < instructions.length -1 || next_add_to_jump !== undefined)
              instructions[(next_add_to_jump !== undefined) ? next_add_to_jump : (current_ins + 1)]._rowVariant = 'success';
        
              // instructions[current_ins +1]._rowVariant = "success";
          }
          // Manejo para double
          capi_read_double('fa0');
          break;
        case 8:
          if(execution_mode_run === 0){
            insn_number = current_ins;
            instructions[current_ins]._rowVariant = "info";
            if (current_ins < instructions.length -1 || next_add_to_jump !== undefined)
              instructions[(next_add_to_jump !== undefined) ? next_add_to_jump : (current_ins + 1)]._rowVariant = 'success';
        
              // instructions[current_ins +1]._rowVariant = "success";
          }
          // last_execution_mode_run = execution_mode_run;
          // execution_mode_run = 2;
          // Manejo para strings
          capi_read_string('a0','a1');
          break;
  
        case 12:
          if(execution_mode_run === 0){
            instructions[current_ins]._rowVariant = "info";
            if (current_ins < instructions.length -1 || next_add_to_jump !== undefined)
              instructions[(next_add_to_jump !== undefined) ? next_add_to_jump : (current_ins + 1)]._rowVariant = 'success';
              // instructions[current_ins +1]._rowVariant = "success";
          }
          // last_execution_mode_run = execution_mode_run;
          // execution_mode_run = 2;
          // Manejo para char
          capi_read_char('a0');
          break;
        default:
          // console.log("No hago nada.");
          syscall_print_code = syscall_code;
          break;
      }
  
      next_add_to_jump = undefined;
    }



    instoper = instMatch[5];

  }
  else if (instMatch && instMatch[2] !== 'U')
    userMode = false;

  if (regiMatch /*&& userMode === true*/) {
    // En caso de ser escritura '<-' pintamos el valor en el registro que corresponde
    if (regiMatch[2] === '<-'){
      let regtowrite = crex_findReg(regiMatch[1]);
      // console.log("Registro identificado: ", regtowrite);
      if (regiMatch[1] !== 'x2')
        writeRegister(parseInt(regiMatch[3], 16), regtowrite.indexComp, regtowrite.indexElem);
    }
    
  }

  if (memoMatch && userMode === true) {
    // En caso de ser escritura '<-' pintamos el valor en la posicion de memoria
    if (memoMatch[2] === '<-'){
      // console.log("Operador: ", instoper);
      switch(instoper){
        case 'sh': // Para almacenar un half
        writeMemory(memoMatch[3], parseInt(memoMatch[1], 16), 'half');
        break;
        case 'sb': // Para almacenar un byte
        writeMemory(memoMatch[3], parseInt(memoMatch[1], 16), 'byte');
        break;
        case 'sw': // Para almacenar un int/word
        writeMemory(memoMatch[3], parseInt(memoMatch[1], 16), 'word');
        break;
        case 'fsw': // Para almacenar un float
        writeMemory(memoMatch[3], parseInt(memoMatch[1], 16), 'float');
        break;
        case 'fsd': // Para almacenar un double
        writeMemory(memoMatch[3], parseInt(memoMatch[1], 16), 'double');
        break;
        default:
          break;
      }

      instoper = "";
    }
  
  }

  if(printMatch && syscall_print_code !== -1){

    let value_2_print = printMatch[2].trim();
    console.log("Estoy dentro de ecall a imprimir");
    console.log(message);
    console.log("Valor a imprimir: ", value_2_print); 
    switch(syscall_print_code){

      case 1: // Print int
        display_print(full_print(parseInt(value_2_print), null, false));
        syscall_print_code = -1;
        break;
      case 2: // Print float
        display_print(full_print(parseFloat(value_2_print), 0, true));
        syscall_print_code = -1;
        break;

      case 3: // Print double
        display_print(full_print(parseFloat(value_2_print), 0, true));
        syscall_print_code = -1;
        break;

      case 4: // Print String 
        display_print(value_2_print);
        syscall_print_code = -1;
        break;

      case 11: // Print char
        display_print(value_2_print);
        syscall_print_code = -1;
        break;

      default: // Rest of syscall codes not able to print
      syscall_print_code = -1;
        break;

    }

  }

  console.log(message);

}

var out = Module["print"] /*|| console.log.bind(console)*/;
var err = Module["printErr"] || console.warn.bind(console);
Object.assign(Module, moduleOverrides);
moduleOverrides = null;
if (Module["arguments"]) arguments_ = Module["arguments"];
if (!Object.getOwnPropertyDescriptor(Module, "arguments")) {
  Object.defineProperty(Module, "arguments", {
    configurable: true,
    get: function () {
      abort(
        "Module.arguments has been replaced with plain arguments_ (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
if (!Object.getOwnPropertyDescriptor(Module, "thisProgram")) {
  Object.defineProperty(Module, "thisProgram", {
    configurable: true,
    get: function () {
      abort(
        "Module.thisProgram has been replaced with plain thisProgram (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
if (Module["quit"]) quit_ = Module["quit"];
if (!Object.getOwnPropertyDescriptor(Module, "quit")) {
  Object.defineProperty(Module, "quit", {
    configurable: true,
    get: function () {
      abort(
        "Module.quit has been replaced with plain quit_ (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
assert(
  typeof Module["memoryInitializerPrefixURL"] == "undefined",
  "Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead",
);
assert(
  typeof Module["pthreadMainPrefixURL"] == "undefined",
  "Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead",
);
assert(
  typeof Module["cdInitializerPrefixURL"] == "undefined",
  "Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead",
);
assert(
  typeof Module["filePackagePrefixURL"] == "undefined",
  "Module.filePackagePrefixURL option was removed, use Module.locateFile instead",
);
assert(
  typeof Module["read"] == "undefined",
  "Module.read option was removed (modify read_ in JS)",
);
assert(
  typeof Module["readAsync"] == "undefined",
  "Module.readAsync option was removed (modify readAsync in JS)",
);
assert(
  typeof Module["readBinary"] == "undefined",
  "Module.readBinary option was removed (modify readBinary in JS)",
);
assert(
  typeof Module["setWindowTitle"] == "undefined",
  "Module.setWindowTitle option was removed (modify setWindowTitle in JS)",
);
assert(
  typeof Module["TOTAL_MEMORY"] == "undefined",
  "Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY",
);
if (!Object.getOwnPropertyDescriptor(Module, "read")) {
  Object.defineProperty(Module, "read", {
    configurable: true,
    get: function () {
      abort(
        "Module.read has been replaced with plain read_ (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
if (!Object.getOwnPropertyDescriptor(Module, "readAsync")) {
  Object.defineProperty(Module, "readAsync", {
    configurable: true,
    get: function () {
      abort(
        "Module.readAsync has been replaced with plain readAsync (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
if (!Object.getOwnPropertyDescriptor(Module, "readBinary")) {
  Object.defineProperty(Module, "readBinary", {
    configurable: true,
    get: function () {
      abort(
        "Module.readBinary has been replaced with plain readBinary (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
if (!Object.getOwnPropertyDescriptor(Module, "setWindowTitle")) {
  Object.defineProperty(Module, "setWindowTitle", {
    configurable: true,
    get: function () {
      abort(
        "Module.setWindowTitle has been replaced with plain setWindowTitle (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
assert(
  !ENVIRONMENT_IS_WORKER,
  "worker environment detected but not enabled at build time.  Add 'worker' to `-s ENVIRONMENT` to enable.",
);
assert(
  !ENVIRONMENT_IS_NODE,
  "node environment detected but not enabled at build time.  Add 'node' to `-s ENVIRONMENT` to enable.",
);
assert(
  !ENVIRONMENT_IS_SHELL,
  "shell environment detected but not enabled at build time.  Add 'shell' to `-s ENVIRONMENT` to enable.",
);
var POINTER_SIZE = 4;
function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    err(text);
  }
}
function convertJsFunctionToWasm(func, sig) {
  if (typeof WebAssembly.Function == "function") {
    var typeNames = { i: "i32", j: "i64", f: "f32", d: "f64" };
    var type = {
      parameters: [],
      results: sig[0] == "v" ? [] : [typeNames[sig[0]]],
    };
    for (var i = 1; i < sig.length; ++i) {
      type.parameters.push(typeNames[sig[i]]);
    }
    return new WebAssembly.Function(type, func);
  }
  var typeSection = [1, 0, 1, 96];
  var sigRet = sig.slice(0, 1);
  var sigParam = sig.slice(1);
  var typeCodes = { i: 127, j: 126, f: 125, d: 124 };
  typeSection.push(sigParam.length);
  for (var i = 0; i < sigParam.length; ++i) {
    typeSection.push(typeCodes[sigParam[i]]);
  }
  if (sigRet == "v") {
    typeSection.push(0);
  } else {
    typeSection = typeSection.concat([1, typeCodes[sigRet]]);
  }
  typeSection[1] = typeSection.length - 2;
  var bytes = new Uint8Array(
    [0, 97, 115, 109, 1, 0, 0, 0].concat(
      typeSection,
      [2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0],
    ),
  );
  var module = new WebAssembly.Module(bytes);
  var instance = new WebAssembly.Instance(module, { e: { f: func } });
  var wrappedFunc = instance.exports["f"];
  return wrappedFunc;
}
var freeTableIndexes = [];
var functionsInTableMap;
function getEmptyTableSlot() {
  if (freeTableIndexes.length) {
    return freeTableIndexes.pop();
  }
  try {
    wasmTable.grow(1);
  } catch (err) {
    if (!(err instanceof RangeError)) {
      throw err;
    }
    throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
  }
  return wasmTable.length - 1;
}
function updateTableMap(offset, count) {
  for (var i = offset; i < offset + count; i++) {
    var item = getWasmTableEntry(i);
    if (item) {
      functionsInTableMap.set(item, i);
    }
  }
}
var tempRet0 = 0;
var setTempRet0 = (value) => {
  tempRet0 = value;
};
var wasmBinary;
if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
if (!Object.getOwnPropertyDescriptor(Module, "wasmBinary")) {
  Object.defineProperty(Module, "wasmBinary", {
    configurable: true,
    get: function () {
      abort(
        "Module.wasmBinary has been replaced with plain wasmBinary (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
var noExitRuntime = Module["noExitRuntime"] || true;
if (!Object.getOwnPropertyDescriptor(Module, "noExitRuntime")) {
  Object.defineProperty(Module, "noExitRuntime", {
    configurable: true,
    get: function () {
      abort(
        "Module.noExitRuntime has been replaced with plain noExitRuntime (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
if (typeof WebAssembly != "object") {
  abort("no native wasm support detected");
}
var wasmMemory;
var ABORT = false;
var EXITSTATUS;
function assert(condition, text) {
  if (!condition) {
    abort("Assertion failed" + (text ? ": " + text : ""));
  }
}
function getCFunc(ident) {
  var func = Module["_" + ident];
  assert(
    func,
    "Cannot call unknown function " + ident + ", make sure it is exported",
  );
  return func;
}
function ccall(ident, returnType, argTypes, args, opts) {
  var toC = {
    string: function (str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) {
        var len = (str.length << 2) + 1;
        ret = stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    },
    array: function (arr) {
      var ret = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
  };
  function convertReturnValue(ret) {
    if (returnType === "string") return UTF8ToString(ret);
    if (returnType === "boolean") return Boolean(ret);
    return ret;
  }
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== "array", 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  function onDone(ret) {
    runtimeKeepalivePop();
    if (stack !== 0) stackRestore(stack);
    return convertReturnValue(ret);
  }
  runtimeKeepalivePush();
  var asyncMode = opts && opts.async;
  if (Asyncify.currData) {
    assert(
      asyncMode,
      "The call to " +
        ident +
        " is running asynchronously. If this was intended, add the async option to the ccall/cwrap call.",
    );
    return Asyncify.whenDone().then(onDone);
  }
  ret = onDone(ret);
  if (asyncMode) return Promise.resolve(ret);
  return ret;
}
var ALLOC_STACK = 1;
var UTF8Decoder =
  typeof TextDecoder != "undefined" ? new TextDecoder("utf8") : undefined;
function UTF8ArrayToString(heap, idx, maxBytesToRead) {
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
  if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(heap.subarray(idx, endPtr));
  } else {
    var str = "";
    while (idx < endPtr) {
      var u0 = heap[idx++];
      if (!(u0 & 128)) {
        str += String.fromCharCode(u0);
        continue;
      }
      var u1 = heap[idx++] & 63;
      if ((u0 & 224) == 192) {
        str += String.fromCharCode(((u0 & 31) << 6) | u1);
        continue;
      }
      var u2 = heap[idx++] & 63;
      if ((u0 & 240) == 224) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        if ((u0 & 248) != 240)
          warnOnce(
            "Invalid UTF-8 leading byte 0x" +
              u0.toString(16) +
              " encountered when deserializing a UTF-8 string in wasm memory to a JS string!",
          );
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heap[idx++] & 63);
      }
      if (u0 < 65536) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 65536;
        str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
      }
    }
  }
  return str;
}
function UTF8ToString(ptr, maxBytesToRead) {
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
}
function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) return 0;
  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1;
  for (var i = 0; i < str.length; ++i) {
    var u = str.charCodeAt(i);
    if (u >= 55296 && u <= 57343) {
      var u1 = str.charCodeAt(++i);
      u = (65536 + ((u & 1023) << 10)) | (u1 & 1023);
    }
    if (u <= 127) {
      if (outIdx >= endIdx) break;
      heap[outIdx++] = u;
    } else if (u <= 2047) {
      if (outIdx + 1 >= endIdx) break;
      heap[outIdx++] = 192 | (u >> 6);
      heap[outIdx++] = 128 | (u & 63);
    } else if (u <= 65535) {
      if (outIdx + 2 >= endIdx) break;
      heap[outIdx++] = 224 | (u >> 12);
      heap[outIdx++] = 128 | ((u >> 6) & 63);
      heap[outIdx++] = 128 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      if (u > 1114111)
        warnOnce(
          "Invalid Unicode code point 0x" +
            u.toString(16) +
            " encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).",
        );
      heap[outIdx++] = 240 | (u >> 18);
      heap[outIdx++] = 128 | ((u >> 12) & 63);
      heap[outIdx++] = 128 | ((u >> 6) & 63);
      heap[outIdx++] = 128 | (u & 63);
    }
  }
  heap[outIdx] = 0;
  return outIdx - startIdx;
}
function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(
    typeof maxBytesToWrite == "number",
    "stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!",
  );
  return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
}
function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    var u = str.charCodeAt(i);
    if (u >= 55296 && u <= 57343)
      u = (65536 + ((u & 1023) << 10)) | (str.charCodeAt(++i) & 1023);
    if (u <= 127) ++len;
    else if (u <= 2047) len += 2;
    else if (u <= 65535) len += 3;
    else len += 4;
  }
  return len;
}
var UTF16Decoder =
  typeof TextDecoder != "undefined" ? new TextDecoder("utf-16le") : undefined;
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}
function writeArrayToMemory(array, buffer) {
  assert(
    array.length >= 0,
    "writeArrayToMemory array must have a length (should be an array or typed array)",
  );
  HEAP8.set(array, buffer);
}
function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === (str.charCodeAt(i) & 255));
    HEAP8[buffer++ >> 0] = str.charCodeAt(i);
  }
  if (!dontAddNull) HEAP8[buffer >> 0] = 0;
}
function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}
var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
function updateGlobalBufferAndViews(buf) {
  buffer = buf;
  Module["HEAP8"] = HEAP8 = new Int8Array(buf);
  Module["HEAP16"] = HEAP16 = new Int16Array(buf);
  Module["HEAP32"] = HEAP32 = new Int32Array(buf);
  Module["HEAPU8"] = HEAPU8 = new Uint8Array(buf);
  Module["HEAPU16"] = HEAPU16 = new Uint16Array(buf);
  Module["HEAPU32"] = HEAPU32 = new Uint32Array(buf);
  Module["HEAPF32"] = HEAPF32 = new Float32Array(buf);
  Module["HEAPF64"] = HEAPF64 = new Float64Array(buf);
}
var TOTAL_STACK = 5242880;
if (Module["TOTAL_STACK"])
  assert(
    TOTAL_STACK === Module["TOTAL_STACK"],
    "the stack size can no longer be determined at runtime",
  );
var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 67108864;
if (!Object.getOwnPropertyDescriptor(Module, "INITIAL_MEMORY")) {
  Object.defineProperty(Module, "INITIAL_MEMORY", {
    configurable: true,
    get: function () {
      abort(
        "Module.INITIAL_MEMORY has been replaced with plain INITIAL_MEMORY (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)",
      );
    },
  });
}
assert(
  INITIAL_MEMORY >= TOTAL_STACK,
  "INITIAL_MEMORY should be larger than TOTAL_STACK, was " +
    INITIAL_MEMORY +
    "! (TOTAL_STACK=" +
    TOTAL_STACK +
    ")",
);
assert(
  typeof Int32Array != "undefined" &&
    typeof Float64Array !== "undefined" &&
    Int32Array.prototype.subarray != undefined &&
    Int32Array.prototype.set != undefined,
  "JS engine does not provide full typed array support",
);
assert(
  !Module["wasmMemory"],
  "Use of `wasmMemory` detected.  Use -s IMPORTED_MEMORY to define wasmMemory externally",
);
assert(
  INITIAL_MEMORY == 67108864,
  "Detected runtime INITIAL_MEMORY setting.  Use -s IMPORTED_MEMORY to define wasmMemory dynamically",
);
var wasmTable;
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  HEAP32[(max + 4) >> 2] = 34821223;
  HEAP32[(max + 8) >> 2] = 2310721022;
  HEAP32[0] = 1668509029;
}
function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  var cookie1 = HEAPU32[(max + 4) >> 2];
  var cookie2 = HEAPU32[(max + 8) >> 2];
  if (cookie1 != 34821223 || cookie2 != 2310721022) {
    abort(
      "Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x2135467, but received 0x" +
        cookie2.toString(16) +
        " 0x" +
        cookie1.toString(16),
    );
  }
  if (HEAP32[0] !== 1668509029)
    abort(
      "Runtime error: The application has corrupted its heap memory area (address zero)!",
    );
}
(function () {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 25459;
  if (h8[0] !== 115 || h8[1] !== 99)
    throw "Runtime error: expected the system to be little-endian! (Run with -s SUPPORT_BIG_ENDIAN=1 to bypass)";
})();
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;
var runtimeKeepaliveCounter = 0;
function keepRuntimeAlive() {
  return noExitRuntime || runtimeKeepaliveCounter > 0;
}
function preRun() {
  if (Module["preRun"]) {
    if (typeof Module["preRun"] == "function")
      Module["preRun"] = [Module["preRun"]];
    while (Module["preRun"].length) {
      addOnPreRun(Module["preRun"].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}
function initRuntime() {
  checkStackCookie();
  assert(!runtimeInitialized);
  runtimeInitialized = true;
  if (!Module["noFSInit"] && !FS.init.initialized) FS.init();
  FS.ignorePermissions = false;
  TTY.init();
  callRuntimeCallbacks(__ATINIT__);
}
function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}
function exitRuntime() {
  Asyncify.state = Asyncify.State.Disabled;
  checkStackCookie();
  runtimeExited = true;
}
function postRun() {
  checkStackCookie();
  if (Module["postRun"]) {
    if (typeof Module["postRun"] == "function")
      Module["postRun"] = [Module["postRun"]];
    while (Module["postRun"].length) {
      addOnPostRun(Module["postRun"].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}
function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
assert(
  Math.imul,
  "This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
);
assert(
  Math.fround,
  "This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
);
assert(
  Math.clz32,
  "This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
);
assert(
  Math.trunc,
  "This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill",
);
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;
var runDependencyTracking = {};
function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
}
function addRunDependency(id) {
  runDependencies++;
  if (Module["monitorRunDependencies"]) {
    Module["monitorRunDependencies"](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval != "undefined") {
      runDependencyWatcher = setInterval(function () {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err("still waiting on run dependencies:");
          }
          err("dependency: " + dep);
        }
        if (shown) {
          err("(end of list)");
        }
      }, 1e4);
    }
  } else {
    err("warning: run dependency added without ID");
  }
}
function removeRunDependency(id) {
  runDependencies--;
  if (Module["monitorRunDependencies"]) {
    Module["monitorRunDependencies"](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err("warning: run dependency removed without ID");
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback();
    }
  }
}
Module["preloadedImages"] = {};
Module["preloadedAudios"] = {};
function abort(what) {
  {
    if (Module["onAbort"]) {
      Module["onAbort"](what);
    }
  }
  what = "Aborted(" + what + ")";
  err(what);
  ABORT = true;
  EXITSTATUS = 1;
  var e = new WebAssembly.RuntimeError(what);
  throw e;
}
var dataURIPrefix = "data:application/octet-stream;base64,";
function isDataURI(filename) {
  return filename.startsWith(dataURIPrefix);
}
function isFileURI(filename) {
  return filename.startsWith("file://");
}
function createExportWrapper(name, fixedasm) {
  return function () {
    var displayName = name;
    var asm = fixedasm;
    if (!fixedasm) {
      asm = Module["asm"];
    }
    assert(
      runtimeInitialized,
      "native function `" +
        displayName +
        "` called before runtime initialization",
    );
    assert(
      !runtimeExited,
      "native function `" +
        displayName +
        "` called after runtime exit (use NO_EXIT_RUNTIME to keep it alive after main() exits)",
    );
    if (!asm[name]) {
      assert(
        asm[name],
        "exported native function `" + displayName + "` not found",
      );
    }
    return asm[name].apply(null, arguments);
  };
}
var wasmBinaryFile;
wasmBinaryFile = "riscv_sim_RV32.wasm";
if (!isDataURI(wasmBinaryFile)) {
  wasmBinaryFile = locateFile(wasmBinaryFile);
}
function getBinary(file) {
  try {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    if (readBinary) {
      return readBinary(file);
    } else {
      throw "both async and sync fetching of the wasm failed";
    }
  } catch (err) {
    abort(err);
  }
}
function getBinaryPromise() {
  if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
    if (typeof fetch == "function") {
      return fetch(wasmBinaryFile, { credentials: "same-origin" })
        .then(function (response) {
          if (!response["ok"]) {
            throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
          }
          return response["arrayBuffer"]();
        })
        .catch(function () {
          return getBinary(wasmBinaryFile);
        });
    }
  }
  return Promise.resolve().then(function () {
    return getBinary(wasmBinaryFile);
  });
}
function createWasm() {
  var info = { env: asmLibraryArg, wasi_snapshot_preview1: asmLibraryArg };
  function receiveInstance(instance, module) {
    var exports = instance.exports;
    exports = Asyncify.instrumentWasmExports(exports);
    Module["asm"] = exports;
    wasmMemory = Module["asm"]["memory"];
    assert(wasmMemory, "memory not found in wasm exports");
    updateGlobalBufferAndViews(wasmMemory.buffer);
    wasmTable = Module["asm"]["__indirect_function_table"];
    assert(wasmTable, "table not found in wasm exports");
    addOnInit(Module["asm"]["__wasm_call_ctors"]);
    removeRunDependency("wasm-instantiate");
  }
  addRunDependency("wasm-instantiate");
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    assert(
      Module === trueModule,
      "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?",
    );
    trueModule = null;
    receiveInstance(result["instance"]);
  }
  function instantiateArrayBuffer(receiver) {
    return getBinaryPromise()
      .then(function (binary) {
        return WebAssembly.instantiate(binary, info);
      })
      .then(function (instance) {
        return instance;
      })
      .then(receiver, function (reason) {
        err("failed to asynchronously prepare wasm: " + reason);
        if (isFileURI(wasmBinaryFile)) {
          err(
            "warning: Loading from a file URI (" +
              wasmBinaryFile +
              ") is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing",
          );
        }
        abort(reason);
      });
  }
  function instantiateAsync() {
    if (
      !wasmBinary &&
      typeof WebAssembly.instantiateStreaming == "function" &&
      !isDataURI(wasmBinaryFile) &&
      typeof fetch == "function"
    ) {
      return fetch(wasmBinaryFile, { credentials: "same-origin" }).then(
        function (response) {
          var result = WebAssembly.instantiateStreaming(response, info);
          return result.then(receiveInstantiationResult, function (reason) {
            err("wasm streaming compile failed: " + reason);
            err("falling back to ArrayBuffer instantiation");
            return instantiateArrayBuffer(receiveInstantiationResult);
          });
        },
      );
    } else {
      return instantiateArrayBuffer(receiveInstantiationResult);
    }
  }
  if (Module["instantiateWasm"]) {
    try {
      var exports = Module["instantiateWasm"](info, receiveInstance);
      exports = Asyncify.instrumentWasmExports(exports);
      return exports;
    } catch (e) {
      err("Module.instantiateWasm callback failed with error: " + e);
      return false;
    }
  }
  instantiateAsync();
  return {};
}
var tempDouble;
var tempI64;
function callRuntimeCallbacks(callbacks) {
  while (callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == "function") {
      callback(Module);
      continue;
    }
    var func = callback.func;
    if (typeof func == "number") {
      if (callback.arg === undefined) {
        (function () {
          dynCall_v.call(null, func);
        })();
      } else {
        (function (a1) {
          dynCall_vi.apply(null, [func, a1]);
        })(callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}
function demangle(func) {
  warnOnce(
    "warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling",
  );
  return func;
}
function demangleAll(text) {
  var regex = /\b_Z[\w\d_]+/g;
  return text.replace(regex, function (x) {
    var y = demangle(x);
    return x === y ? x : y + " [" + x + "]";
  });
}
var wasmTableMirror = [];
function getWasmTableEntry(funcPtr) {
  var func = wasmTableMirror[funcPtr];
  if (!func) {
    if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
    wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
  }
  assert(
    wasmTable.get(funcPtr) == func,
    "JavaScript-side Wasm function table mirror is out of date!",
  );
  return func;
}
function handleException(e) {
  if (e instanceof ExitStatus || e == "unwind" || e.message === "Force exit by user") {
    return EXITSTATUS;
  }
  quit_(1, e);
}
function jsStackTrace() {
  var error = new Error();
  if (!error.stack) {
    try {
      throw new Error();
    } catch (e) {
      error = e;
    }
    if (!error.stack) {
      return "(no stack trace available)";
    }
  }
  return error.stack.toString();
}
function setWasmTableEntry(idx, func) {
  wasmTable.set(idx, func);
  wasmTableMirror[idx] = func;
}
function ___assert_fail(condition, filename, line, func) {
  abort(
    "Assertion failed: " +
      UTF8ToString(condition) +
      ", at: " +
      [
        filename ? UTF8ToString(filename) : "unknown filename",
        line,
        func ? UTF8ToString(func) : "unknown function",
      ],
  );
}
function setErrNo(value) {
  HEAP32[___errno_location() >> 2] = value;
  return value;
}
var PATH = {
  splitPath: function (filename) {
    var splitPathRe =
      /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
    return splitPathRe.exec(filename).slice(1);
  },
  normalizeArray: function (parts, allowAboveRoot) {
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === ".") {
        parts.splice(i, 1);
      } else if (last === "..") {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }
    if (allowAboveRoot) {
      for (; up; up--) {
        parts.unshift("..");
      }
    }
    return parts;
  },
  normalize: function (path) {
    var isAbsolute = path.charAt(0) === "/",
      trailingSlash = path.substr(-1) === "/";
    path = PATH.normalizeArray(
      path.split("/").filter(function (p) {
        return !!p;
      }),
      !isAbsolute,
    ).join("/");
    if (!path && !isAbsolute) {
      path = ".";
    }
    if (path && trailingSlash) {
      path += "/";
    }
    return (isAbsolute ? "/" : "") + path;
  },
  dirname: function (path) {
    var result = PATH.splitPath(path),
      root = result[0],
      dir = result[1];
    if (!root && !dir) {
      return ".";
    }
    if (dir) {
      dir = dir.substr(0, dir.length - 1);
    }
    return root + dir;
  },
  basename: function (path) {
    if (path === "/") return "/";
    path = PATH.normalize(path);
    path = path.replace(/\/$/, "");
    var lastSlash = path.lastIndexOf("/");
    if (lastSlash === -1) return path;
    return path.substr(lastSlash + 1);
  },
  extname: function (path) {
    return PATH.splitPath(path)[3];
  },
  join: function () {
    var paths = Array.prototype.slice.call(arguments, 0);
    return PATH.normalize(paths.join("/"));
  },
  join2: function (l, r) {
    return PATH.normalize(l + "/" + r);
  },
};
function getRandomDevice() {
  if (
    typeof crypto == "object" &&
    typeof crypto["getRandomValues"] == "function"
  ) {
    var randomBuffer = new Uint8Array(1);
    return function () {
      crypto.getRandomValues(randomBuffer);
      return randomBuffer[0];
    };
  } else
    return function () {
      abort(
        "no cryptographic support found for randomDevice. consider polyfilling it if you want to use something insecure like Math.random(), e.g. put this in a --pre-js: var crypto = { getRandomValues: function(array) { for (var i = 0; i < array.length; i++) array[i] = (Math.random()*256)|0 } };",
      );
    };
}
var PATH_FS = {
  resolve: function () {
    var resolvedPath = "",
      resolvedAbsolute = false;
    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = i >= 0 ? arguments[i] : FS.cwd();
      if (typeof path != "string") {
        throw new TypeError("Arguments to path.resolve must be strings");
      } else if (!path) {
        return "";
      }
      resolvedPath = path + "/" + resolvedPath;
      resolvedAbsolute = path.charAt(0) === "/";
    }
    resolvedPath = PATH.normalizeArray(
      resolvedPath.split("/").filter(function (p) {
        return !!p;
      }),
      !resolvedAbsolute,
    ).join("/");
    return (resolvedAbsolute ? "/" : "") + resolvedPath || ".";
  },
  relative: function (from, to) {
    from = PATH_FS.resolve(from).substr(1);
    to = PATH_FS.resolve(to).substr(1);
    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== "") break;
      }
      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== "") break;
      }
      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }
    var fromParts = trim(from.split("/"));
    var toParts = trim(to.split("/"));
    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }
    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push("..");
    }
    outputParts = outputParts.concat(toParts.slice(samePartsLength));
    return outputParts.join("/");
  },
};
var TTY = {
  ttys: [],
  init: function () {},
  shutdown: function () {},
  register: function (dev, ops) {
    TTY.ttys[dev] = { input: [], output: [], ops: ops };
    FS.registerDevice(dev, TTY.stream_ops);
  },
  stream_ops: {
    open: function (stream) {
      var tty = TTY.ttys[stream.node.rdev];
      if (!tty) {
        throw new FS.ErrnoError(43);
      }
      stream.tty = tty;
      stream.seekable = false;
    },
    close: function (stream) {
      stream.tty.ops.flush(stream.tty);
    },
    flush: function (stream) {
      stream.tty.ops.flush(stream.tty);
    },
    read: function (stream, buffer, offset, length, pos) {
      if (!stream.tty || !stream.tty.ops.get_char) {
        throw new FS.ErrnoError(60);
      }
      var bytesRead = 0;
      for (var i = 0; i < length; i++) {
        var result;
        try {
          result = stream.tty.ops.get_char(stream.tty);
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
        if (result === undefined && bytesRead === 0) {
          throw new FS.ErrnoError(6);
        }
        if (result === null || result === undefined) break;
        bytesRead++;
        buffer[offset + i] = result;
      }
      if (bytesRead) {
        stream.node.timestamp = Date.now();
      }
      return bytesRead;
    },
    write: function (stream, buffer, offset, length, pos) {
      if (!stream.tty || !stream.tty.ops.put_char) {
        throw new FS.ErrnoError(60);
      }
      try {
        for (var i = 0; i < length; i++) {
          stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
        }
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
      if (length) {
        stream.node.timestamp = Date.now();
      }
      return i;
    },
  },
  default_tty_ops: {
    get_char: function (tty) {
      if (!tty.input.length) {
        var result = null;
        if (
          typeof window != "undefined" &&
          typeof window.prompt == "function"
        ) {
          result = window.prompt("Input: ");
          if (result !== null) {
            result += "\n";
          }
        } else if (typeof readline == "function") {
          result = readline();
          if (result !== null) {
            result += "\n";
          }
        }
        if (!result) {
          return null;
        }
        tty.input = intArrayFromString(result, true);
      }
      return tty.input.shift();
    },
    put_char: function (tty, val) {
      if (val === null || val === 10) {
        out(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      } else {
        if (val != 0) tty.output.push(val);
      }
    },
    flush: function (tty) {
      if (tty.output && tty.output.length > 0) {
        out(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      }
    },
  },
  default_tty1_ops: {
    put_char: function (tty, val) {
      if (val === null || val === 10) {
        err(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      } else {
        if (val != 0) tty.output.push(val);
      }
    },
    flush: function (tty) {
      if (tty.output && tty.output.length > 0) {
        err(UTF8ArrayToString(tty.output, 0));
        tty.output = [];
      }
    },
  },
};
function zeroMemory(address, size) {
  HEAPU8.fill(0, address, address + size);
}
function alignMemory(size, alignment) {
  assert(alignment, "alignment argument is required");
  return Math.ceil(size / alignment) * alignment;
}
function mmapAlloc(size) {
  size = alignMemory(size, 65536);
  var ptr = _emscripten_builtin_memalign(65536, size);
  if (!ptr) return 0;
  zeroMemory(ptr, size);
  return ptr;
}
var MEMFS = {
  ops_table: null,
  mount: function (mount) {
    return MEMFS.createNode(null, "/", 16384 | 511, 0);
  },
  createNode: function (parent, name, mode, dev) {
    if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
      throw new FS.ErrnoError(63);
    }
    if (!MEMFS.ops_table) {
      MEMFS.ops_table = {
        dir: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr,
            lookup: MEMFS.node_ops.lookup,
            mknod: MEMFS.node_ops.mknod,
            rename: MEMFS.node_ops.rename,
            unlink: MEMFS.node_ops.unlink,
            rmdir: MEMFS.node_ops.rmdir,
            readdir: MEMFS.node_ops.readdir,
            symlink: MEMFS.node_ops.symlink,
          },
          stream: { llseek: MEMFS.stream_ops.llseek },
        },
        file: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr,
          },
          stream: {
            llseek: MEMFS.stream_ops.llseek,
            read: MEMFS.stream_ops.read,
            write: MEMFS.stream_ops.write,
            allocate: MEMFS.stream_ops.allocate,
            mmap: MEMFS.stream_ops.mmap,
            msync: MEMFS.stream_ops.msync,
          },
        },
        link: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr,
            readlink: MEMFS.node_ops.readlink,
          },
          stream: {},
        },
        chrdev: {
          node: {
            getattr: MEMFS.node_ops.getattr,
            setattr: MEMFS.node_ops.setattr,
          },
          stream: FS.chrdev_stream_ops,
        },
      };
    }
    var node = FS.createNode(parent, name, mode, dev);
    if (FS.isDir(node.mode)) {
      node.node_ops = MEMFS.ops_table.dir.node;
      node.stream_ops = MEMFS.ops_table.dir.stream;
      node.contents = {};
    } else if (FS.isFile(node.mode)) {
      node.node_ops = MEMFS.ops_table.file.node;
      node.stream_ops = MEMFS.ops_table.file.stream;
      node.usedBytes = 0;
      node.contents = null;
    } else if (FS.isLink(node.mode)) {
      node.node_ops = MEMFS.ops_table.link.node;
      node.stream_ops = MEMFS.ops_table.link.stream;
    } else if (FS.isChrdev(node.mode)) {
      node.node_ops = MEMFS.ops_table.chrdev.node;
      node.stream_ops = MEMFS.ops_table.chrdev.stream;
    }
    node.timestamp = Date.now();
    if (parent) {
      parent.contents[name] = node;
      parent.timestamp = node.timestamp;
    }
    return node;
  },
  getFileDataAsTypedArray: function (node) {
    if (!node.contents) return new Uint8Array(0);
    if (node.contents.subarray)
      return node.contents.subarray(0, node.usedBytes);
    return new Uint8Array(node.contents);
  },
  expandFileStorage: function (node, newCapacity) {
    var prevCapacity = node.contents ? node.contents.length : 0;
    if (prevCapacity >= newCapacity) return;
    var CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(
      newCapacity,
      (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) >>> 0,
    );
    if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
    var oldContents = node.contents;
    node.contents = new Uint8Array(newCapacity);
    if (node.usedBytes > 0)
      node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
  },
  resizeFileStorage: function (node, newSize) {
    if (node.usedBytes == newSize) return;
    if (newSize == 0) {
      node.contents = null;
      node.usedBytes = 0;
    } else {
      var oldContents = node.contents;
      node.contents = new Uint8Array(newSize);
      if (oldContents) {
        node.contents.set(
          oldContents.subarray(0, Math.min(newSize, node.usedBytes)),
        );
      }
      node.usedBytes = newSize;
    }
  },
  node_ops: {
    getattr: function (node) {
      var attr = {};
      attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
      attr.ino = node.id;
      attr.mode = node.mode;
      attr.nlink = 1;
      attr.uid = 0;
      attr.gid = 0;
      attr.rdev = node.rdev;
      if (FS.isDir(node.mode)) {
        attr.size = 4096;
      } else if (FS.isFile(node.mode)) {
        attr.size = node.usedBytes;
      } else if (FS.isLink(node.mode)) {
        attr.size = node.link.length;
      } else {
        attr.size = 0;
      }
      attr.atime = new Date(node.timestamp);
      attr.mtime = new Date(node.timestamp);
      attr.ctime = new Date(node.timestamp);
      attr.blksize = 4096;
      attr.blocks = Math.ceil(attr.size / attr.blksize);
      return attr;
    },
    setattr: function (node, attr) {
      if (attr.mode !== undefined) {
        node.mode = attr.mode;
      }
      if (attr.timestamp !== undefined) {
        node.timestamp = attr.timestamp;
      }
      if (attr.size !== undefined) {
        MEMFS.resizeFileStorage(node, attr.size);
      }
    },
    lookup: function (parent, name) {
      throw FS.genericErrors[44];
    },
    mknod: function (parent, name, mode, dev) {
      return MEMFS.createNode(parent, name, mode, dev);
    },
    rename: function (old_node, new_dir, new_name) {
      if (FS.isDir(old_node.mode)) {
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {}
        if (new_node) {
          for (var i in new_node.contents) {
            throw new FS.ErrnoError(55);
          }
        }
      }
      delete old_node.parent.contents[old_node.name];
      old_node.parent.timestamp = Date.now();
      old_node.name = new_name;
      new_dir.contents[new_name] = old_node;
      new_dir.timestamp = old_node.parent.timestamp;
      old_node.parent = new_dir;
    },
    unlink: function (parent, name) {
      delete parent.contents[name];
      parent.timestamp = Date.now();
    },
    rmdir: function (parent, name) {
      var node = FS.lookupNode(parent, name);
      for (var i in node.contents) {
        throw new FS.ErrnoError(55);
      }
      delete parent.contents[name];
      parent.timestamp = Date.now();
    },
    readdir: function (node) {
      var entries = [".", ".."];
      for (var key in node.contents) {
        if (!node.contents.hasOwnProperty(key)) {
          continue;
        }
        entries.push(key);
      }
      return entries;
    },
    symlink: function (parent, newname, oldpath) {
      var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
      node.link = oldpath;
      return node;
    },
    readlink: function (node) {
      if (!FS.isLink(node.mode)) {
        throw new FS.ErrnoError(28);
      }
      return node.link;
    },
  },
  stream_ops: {
    read: function (stream, buffer, offset, length, position) {
      var contents = stream.node.contents;
      if (position >= stream.node.usedBytes) return 0;
      var size = Math.min(stream.node.usedBytes - position, length);
      assert(size >= 0);
      if (size > 8 && contents.subarray) {
        buffer.set(contents.subarray(position, position + size), offset);
      } else {
        for (var i = 0; i < size; i++)
          buffer[offset + i] = contents[position + i];
      }
      return size;
    },
    write: function (stream, buffer, offset, length, position, canOwn) {
      assert(!(buffer instanceof ArrayBuffer));
      if (buffer.buffer === HEAP8.buffer) {
        canOwn = false;
      }
      if (!length) return 0;
      var node = stream.node;
      node.timestamp = Date.now();
      if (buffer.subarray && (!node.contents || node.contents.subarray)) {
        if (canOwn) {
          assert(
            position === 0,
            "canOwn must imply no weird position inside the file",
          );
          node.contents = buffer.subarray(offset, offset + length);
          node.usedBytes = length;
          return length;
        } else if (node.usedBytes === 0 && position === 0) {
          node.contents = buffer.slice(offset, offset + length);
          node.usedBytes = length;
          return length;
        } else if (position + length <= node.usedBytes) {
          node.contents.set(buffer.subarray(offset, offset + length), position);
          return length;
        }
      }
      MEMFS.expandFileStorage(node, position + length);
      if (node.contents.subarray && buffer.subarray) {
        node.contents.set(buffer.subarray(offset, offset + length), position);
      } else {
        for (var i = 0; i < length; i++) {
          node.contents[position + i] = buffer[offset + i];
        }
      }
      node.usedBytes = Math.max(node.usedBytes, position + length);
      return length;
    },
    llseek: function (stream, offset, whence) {
      var position = offset;
      if (whence === 1) {
        position += stream.position;
      } else if (whence === 2) {
        if (FS.isFile(stream.node.mode)) {
          position += stream.node.usedBytes;
        }
      }
      if (position < 0) {
        throw new FS.ErrnoError(28);
      }
      return position;
    },
    allocate: function (stream, offset, length) {
      MEMFS.expandFileStorage(stream.node, offset + length);
      stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
    },
    mmap: function (stream, address, length, position, prot, flags) {
      if (address !== 0) {
        throw new FS.ErrnoError(28);
      }
      if (!FS.isFile(stream.node.mode)) {
        throw new FS.ErrnoError(43);
      }
      var ptr;
      var allocated;
      var contents = stream.node.contents;
      if (!(flags & 2) && contents.buffer === buffer) {
        allocated = false;
        ptr = contents.byteOffset;
      } else {
        if (position > 0 || position + length < contents.length) {
          if (contents.subarray) {
            contents = contents.subarray(position, position + length);
          } else {
            contents = Array.prototype.slice.call(
              contents,
              position,
              position + length,
            );
          }
        }
        allocated = true;
        ptr = mmapAlloc(length);
        if (!ptr) {
          throw new FS.ErrnoError(48);
        }
        HEAP8.set(contents, ptr);
      }
      return { ptr: ptr, allocated: allocated };
    },
    msync: function (stream, buffer, offset, length, mmapFlags) {
      if (!FS.isFile(stream.node.mode)) {
        throw new FS.ErrnoError(43);
      }
      if (mmapFlags & 2) {
        return 0;
      }
      var bytesWritten = MEMFS.stream_ops.write(
        stream,
        buffer,
        0,
        length,
        offset,
        false,
      );
      return 0;
    },
  },
};
function asyncLoad(url, onload, onerror, noRunDep) {
  var dep = !noRunDep ? getUniqueRunDependency("al " + url) : "";
  readAsync(
    url,
    function (arrayBuffer) {
      assert(
        arrayBuffer,
        'Loading data file "' + url + '" failed (no arrayBuffer).',
      );
      onload(new Uint8Array(arrayBuffer));
      if (dep) removeRunDependency(dep);
    },
    function (event) {
      if (onerror) {
        onerror();
      } else {
        throw 'Loading data file "' + url + '" failed.';
      }
    },
  );
  if (dep) addRunDependency(dep);
}
var ERRNO_MESSAGES = {
  0: "Success",
  1: "Arg list too long",
  2: "Permission denied",
  3: "Address already in use",
  4: "Address not available",
  5: "Address family not supported by protocol family",
  6: "No more processes",
  7: "Socket already connected",
  8: "Bad file number",
  9: "Trying to read unreadable message",
  10: "Mount device busy",
  11: "Operation canceled",
  12: "No children",
  13: "Connection aborted",
  14: "Connection refused",
  15: "Connection reset by peer",
  16: "File locking deadlock error",
  17: "Destination address required",
  18: "Math arg out of domain of func",
  19: "Quota exceeded",
  20: "File exists",
  21: "Bad address",
  22: "File too large",
  23: "Host is unreachable",
  24: "Identifier removed",
  25: "Illegal byte sequence",
  26: "Connection already in progress",
  27: "Interrupted system call",
  28: "Invalid argument",
  29: "I/O error",
  30: "Socket is already connected",
  31: "Is a directory",
  32: "Too many symbolic links",
  33: "Too many open files",
  34: "Too many links",
  35: "Message too long",
  36: "Multihop attempted",
  37: "File or path name too long",
  38: "Network interface is not configured",
  39: "Connection reset by network",
  40: "Network is unreachable",
  41: "Too many open files in system",
  42: "No buffer space available",
  43: "No such device",
  44: "No such file or directory",
  45: "Exec format error",
  46: "No record locks available",
  47: "The link has been severed",
  48: "Not enough core",
  49: "No message of desired type",
  50: "Protocol not available",
  51: "No space left on device",
  52: "Function not implemented",
  53: "Socket is not connected",
  54: "Not a directory",
  55: "Directory not empty",
  56: "State not recoverable",
  57: "Socket operation on non-socket",
  59: "Not a typewriter",
  60: "No such device or address",
  61: "Value too large for defined data type",
  62: "Previous owner died",
  63: "Not super-user",
  64: "Broken pipe",
  65: "Protocol error",
  66: "Unknown protocol",
  67: "Protocol wrong type for socket",
  68: "Math result not representable",
  69: "Read only file system",
  70: "Illegal seek",
  71: "No such process",
  72: "Stale file handle",
  73: "Connection timed out",
  74: "Text file busy",
  75: "Cross-device link",
  100: "Device not a stream",
  101: "Bad font file fmt",
  102: "Invalid slot",
  103: "Invalid request code",
  104: "No anode",
  105: "Block device required",
  106: "Channel number out of range",
  107: "Level 3 halted",
  108: "Level 3 reset",
  109: "Link number out of range",
  110: "Protocol driver not attached",
  111: "No CSI structure available",
  112: "Level 2 halted",
  113: "Invalid exchange",
  114: "Invalid request descriptor",
  115: "Exchange full",
  116: "No data (for no delay io)",
  117: "Timer expired",
  118: "Out of streams resources",
  119: "Machine is not on the network",
  120: "Package not installed",
  121: "The object is remote",
  122: "Advertise error",
  123: "Srmount error",
  124: "Communication error on send",
  125: "Cross mount point (not really error)",
  126: "Given log. name not unique",
  127: "f.d. invalid for this operation",
  128: "Remote address changed",
  129: "Can   access a needed shared lib",
  130: "Accessing a corrupted shared lib",
  131: ".lib section in a.out corrupted",
  132: "Attempting to link in too many libs",
  133: "Attempting to exec a shared library",
  135: "Streams pipe error",
  136: "Too many users",
  137: "Socket type not supported",
  138: "Not supported",
  139: "Protocol family not supported",
  140: "Can't send after socket shutdown",
  141: "Too many references",
  142: "Host is down",
  148: "No medium (in tape drive)",
  156: "Level 2 not synchronized",
};
var ERRNO_CODES = {};
var FS = {
  root: null,
  mounts: [],
  devices: {},
  streams: [],
  nextInode: 1,
  nameTable: null,
  currentPath: "/",
  initialized: false,
  ignorePermissions: true,
  ErrnoError: null,
  genericErrors: {},
  filesystems: null,
  syncFSRequests: 0,
  lookupPath: (path, opts = {}) => {
    path = PATH_FS.resolve(FS.cwd(), path);
    if (!path) return { path: "", node: null };
    var defaults = { follow_mount: true, recurse_count: 0 };
    for (var key in defaults) {
      if (opts[key] === undefined) {
        opts[key] = defaults[key];
      }
    }
    if (opts.recurse_count > 8) {
      throw new FS.ErrnoError(32);
    }
    var parts = PATH.normalizeArray(
      path.split("/").filter((p) => !!p),
      false,
    );
    var current = FS.root;
    var current_path = "/";
    for (var i = 0; i < parts.length; i++) {
      var islast = i === parts.length - 1;
      if (islast && opts.parent) {
        break;
      }
      current = FS.lookupNode(current, parts[i]);
      current_path = PATH.join2(current_path, parts[i]);
      if (FS.isMountpoint(current)) {
        if (!islast || (islast && opts.follow_mount)) {
          current = current.mounted.root;
        }
      }
      if (!islast || opts.follow) {
        var count = 0;
        while (FS.isLink(current.mode)) {
          var link = FS.readlink(current_path);
          current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
          var lookup = FS.lookupPath(current_path, {
            recurse_count: opts.recurse_count,
          });
          current = lookup.node;
          if (count++ > 40) {
            throw new FS.ErrnoError(32);
          }
        }
      }
    }
    return { path: current_path, node: current };
  },
  getPath: (node) => {
    var path;
    while (true) {
      if (FS.isRoot(node)) {
        var mount = node.mount.mountpoint;
        if (!path) return mount;
        return mount[mount.length - 1] !== "/"
          ? mount + "/" + path
          : mount + path;
      }
      path = path ? node.name + "/" + path : node.name;
      node = node.parent;
    }
  },
  hashName: (parentid, name) => {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return ((parentid + hash) >>> 0) % FS.nameTable.length;
  },
  hashAddNode: (node) => {
    var hash = FS.hashName(node.parent.id, node.name);
    node.name_next = FS.nameTable[hash];
    FS.nameTable[hash] = node;
  },
  hashRemoveNode: (node) => {
    var hash = FS.hashName(node.parent.id, node.name);
    if (FS.nameTable[hash] === node) {
      FS.nameTable[hash] = node.name_next;
    } else {
      var current = FS.nameTable[hash];
      while (current) {
        if (current.name_next === node) {
          current.name_next = node.name_next;
          break;
        }
        current = current.name_next;
      }
    }
  },
  lookupNode: (parent, name) => {
    var errCode = FS.mayLookup(parent);
    if (errCode) {
      throw new FS.ErrnoError(errCode, parent);
    }
    var hash = FS.hashName(parent.id, name);
    for (var node = FS.nameTable[hash]; node; node = node.name_next) {
      var nodeName = node.name;
      if (node.parent.id === parent.id && nodeName === name) {
        return node;
      }
    }
    return FS.lookup(parent, name);
  },
  createNode: (parent, name, mode, rdev) => {
    assert(typeof parent == "object");
    var node = new FS.FSNode(parent, name, mode, rdev);
    FS.hashAddNode(node);
    return node;
  },
  destroyNode: (node) => {
    FS.hashRemoveNode(node);
  },
  isRoot: (node) => {
    return node === node.parent;
  },
  isMountpoint: (node) => {
    return !!node.mounted;
  },
  isFile: (mode) => {
    return (mode & 61440) === 32768;
  },
  isDir: (mode) => {
    return (mode & 61440) === 16384;
  },
  isLink: (mode) => {
    return (mode & 61440) === 40960;
  },
  isChrdev: (mode) => {
    return (mode & 61440) === 8192;
  },
  isBlkdev: (mode) => {
    return (mode & 61440) === 24576;
  },
  isFIFO: (mode) => {
    return (mode & 61440) === 4096;
  },
  isSocket: (mode) => {
    return (mode & 49152) === 49152;
  },
  flagModes: { r: 0, "r+": 2, w: 577, "w+": 578, a: 1089, "a+": 1090 },
  modeStringToFlags: (str) => {
    var flags = FS.flagModes[str];
    if (typeof flags == "undefined") {
      throw new Error("Unknown file open mode: " + str);
    }
    return flags;
  },
  flagsToPermissionString: (flag) => {
    var perms = ["r", "w", "rw"][flag & 3];
    if (flag & 512) {
      perms += "w";
    }
    return perms;
  },
  nodePermissions: (node, perms) => {
    if (FS.ignorePermissions) {
      return 0;
    }
    if (perms.includes("r") && !(node.mode & 292)) {
      return 2;
    } else if (perms.includes("w") && !(node.mode & 146)) {
      return 2;
    } else if (perms.includes("x") && !(node.mode & 73)) {
      return 2;
    }
    return 0;
  },
  mayLookup: (dir) => {
    var errCode = FS.nodePermissions(dir, "x");
    if (errCode) return errCode;
    if (!dir.node_ops.lookup) return 2;
    return 0;
  },
  mayCreate: (dir, name) => {
    try {
      var node = FS.lookupNode(dir, name);
      return 20;
    } catch (e) {}
    return FS.nodePermissions(dir, "wx");
  },
  mayDelete: (dir, name, isdir) => {
    var node;
    try {
      node = FS.lookupNode(dir, name);
    } catch (e) {
      return e.errno;
    }
    var errCode = FS.nodePermissions(dir, "wx");
    if (errCode) {
      return errCode;
    }
    if (isdir) {
      if (!FS.isDir(node.mode)) {
        return 54;
      }
      if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
        return 10;
      }
    } else {
      if (FS.isDir(node.mode)) {
        return 31;
      }
    }
    return 0;
  },
  mayOpen: (node, flags) => {
    if (!node) {
      return 44;
    }
    if (FS.isLink(node.mode)) {
      return 32;
    } else if (FS.isDir(node.mode)) {
      if (FS.flagsToPermissionString(flags) !== "r" || flags & 512) {
        return 31;
      }
    }
    return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
  },
  MAX_OPEN_FDS: 4096,
  nextfd: (fd_start = 0, fd_end = FS.MAX_OPEN_FDS) => {
    for (var fd = fd_start; fd <= fd_end; fd++) {
      if (!FS.streams[fd]) {
        return fd;
      }
    }
    throw new FS.ErrnoError(33);
  },
  getStream: (fd) => FS.streams[fd],
  createStream: (stream, fd_start, fd_end) => {
    if (!FS.FSStream) {
      FS.FSStream = function () {};
      FS.FSStream.prototype = {
        object: {
          get: function () {
            return this.node;
          },
          set: function (val) {
            this.node = val;
          },
        },
        isRead: {
          get: function () {
            return (this.flags & 2097155) !== 1;
          },
        },
        isWrite: {
          get: function () {
            return (this.flags & 2097155) !== 0;
          },
        },
        isAppend: {
          get: function () {
            return this.flags & 1024;
          },
        },
      };
    }
    stream = Object.assign(new FS.FSStream(), stream);
    var fd = FS.nextfd(fd_start, fd_end);
    stream.fd = fd;
    FS.streams[fd] = stream;
    return stream;
  },
  closeStream: (fd) => {
    FS.streams[fd] = null;
  },
  chrdev_stream_ops: {
    open: (stream) => {
      var device = FS.getDevice(stream.node.rdev);
      stream.stream_ops = device.stream_ops;
      if (stream.stream_ops.open) {
        stream.stream_ops.open(stream);
      }
    },
    llseek: () => {
      throw new FS.ErrnoError(70);
    },
  },
  major: (dev) => dev >> 8,
  minor: (dev) => dev & 255,
  makedev: (ma, mi) => (ma << 8) | mi,
  registerDevice: (dev, ops) => {
    FS.devices[dev] = { stream_ops: ops };
  },
  getDevice: (dev) => FS.devices[dev],
  getMounts: (mount) => {
    var mounts = [];
    var check = [mount];
    while (check.length) {
      var m = check.pop();
      mounts.push(m);
      check.push.apply(check, m.mounts);
    }
    return mounts;
  },
  syncfs: (populate, callback) => {
    if (typeof populate == "function") {
      callback = populate;
      populate = false;
    }
    FS.syncFSRequests++;
    if (FS.syncFSRequests > 1) {
      err(
        "warning: " +
          FS.syncFSRequests +
          " FS.syncfs operations in flight at once, probably just doing extra work",
      );
    }
    var mounts = FS.getMounts(FS.root.mount);
    var completed = 0;
    function doCallback(errCode) {
      assert(FS.syncFSRequests > 0);
      FS.syncFSRequests--;
      return callback(errCode);
    }
    function done(errCode) {
      if (errCode) {
        if (!done.errored) {
          done.errored = true;
          return doCallback(errCode);
        }
        return;
      }
      if (++completed >= mounts.length) {
        doCallback(null);
      }
    }
    mounts.forEach((mount) => {
      if (!mount.type.syncfs) {
        return done(null);
      }
      mount.type.syncfs(mount, populate, done);
    });
  },
  mount: (type, opts, mountpoint) => {
    if (typeof type == "string") {
      throw type;
    }
    var root = mountpoint === "/";
    var pseudo = !mountpoint;
    var node;
    if (root && FS.root) {
      throw new FS.ErrnoError(10);
    } else if (!root && !pseudo) {
      var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
      mountpoint = lookup.path;
      node = lookup.node;
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(10);
      }
      if (!FS.isDir(node.mode)) {
        throw new FS.ErrnoError(54);
      }
    }
    var mount = { type: type, opts: opts, mountpoint: mountpoint, mounts: [] };
    var mountRoot = type.mount(mount);
    mountRoot.mount = mount;
    mount.root = mountRoot;
    if (root) {
      FS.root = mountRoot;
    } else if (node) {
      node.mounted = mount;
      if (node.mount) {
        node.mount.mounts.push(mount);
      }
    }
    return mountRoot;
  },
  unmount: (mountpoint) => {
    var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
    if (!FS.isMountpoint(lookup.node)) {
      throw new FS.ErrnoError(28);
    }
    var node = lookup.node;
    var mount = node.mounted;
    var mounts = FS.getMounts(mount);
    Object.keys(FS.nameTable).forEach((hash) => {
      var current = FS.nameTable[hash];
      while (current) {
        var next = current.name_next;
        if (mounts.includes(current.mount)) {
          FS.destroyNode(current);
        }
        current = next;
      }
    });
    node.mounted = null;
    var idx = node.mount.mounts.indexOf(mount);
    assert(idx !== -1);
    node.mount.mounts.splice(idx, 1);
  },
  lookup: (parent, name) => {
    return parent.node_ops.lookup(parent, name);
  },
  mknod: (path, mode, dev) => {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    if (!name || name === "." || name === "..") {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.mayCreate(parent, name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.mknod) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.mknod(parent, name, mode, dev);
  },
  create: (path, mode) => {
    mode = mode !== undefined ? mode : 438;
    mode &= 4095;
    mode |= 32768;
    return FS.mknod(path, mode, 0);
  },
  mkdir: (path, mode) => {
    mode = mode !== undefined ? mode : 511;
    mode &= 511 | 512;
    mode |= 16384;
    return FS.mknod(path, mode, 0);
  },
  mkdirTree: (path, mode) => {
    var dirs = path.split("/");
    var d = "";
    for (var i = 0; i < dirs.length; ++i) {
      if (!dirs[i]) continue;
      d += "/" + dirs[i];
      try {
        FS.mkdir(d, mode);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
    }
  },
  mkdev: (path, mode, dev) => {
    if (typeof dev == "undefined") {
      dev = mode;
      mode = 438;
    }
    mode |= 8192;
    return FS.mknod(path, mode, dev);
  },
  symlink: (oldpath, newpath) => {
    if (!PATH_FS.resolve(oldpath)) {
      throw new FS.ErrnoError(44);
    }
    var lookup = FS.lookupPath(newpath, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var newname = PATH.basename(newpath);
    var errCode = FS.mayCreate(parent, newname);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.symlink) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.symlink(parent, newname, oldpath);
  },
  rename: (old_path, new_path) => {
    var old_dirname = PATH.dirname(old_path);
    var new_dirname = PATH.dirname(new_path);
    var old_name = PATH.basename(old_path);
    var new_name = PATH.basename(new_path);
    var lookup, old_dir, new_dir;
    lookup = FS.lookupPath(old_path, { parent: true });
    old_dir = lookup.node;
    lookup = FS.lookupPath(new_path, { parent: true });
    new_dir = lookup.node;
    if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
    if (old_dir.mount !== new_dir.mount) {
      throw new FS.ErrnoError(75);
    }
    var old_node = FS.lookupNode(old_dir, old_name);
    var relative = PATH_FS.relative(old_path, new_dirname);
    if (relative.charAt(0) !== ".") {
      throw new FS.ErrnoError(28);
    }
    relative = PATH_FS.relative(new_path, old_dirname);
    if (relative.charAt(0) !== ".") {
      throw new FS.ErrnoError(55);
    }
    var new_node;
    try {
      new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {}
    if (old_node === new_node) {
      return;
    }
    var isdir = FS.isDir(old_node.mode);
    var errCode = FS.mayDelete(old_dir, old_name, isdir);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    errCode = new_node
      ? FS.mayDelete(new_dir, new_name, isdir)
      : FS.mayCreate(new_dir, new_name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!old_dir.node_ops.rename) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
      throw new FS.ErrnoError(10);
    }
    if (new_dir !== old_dir) {
      errCode = FS.nodePermissions(old_dir, "w");
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    FS.hashRemoveNode(old_node);
    try {
      old_dir.node_ops.rename(old_node, new_dir, new_name);
    } catch (e) {
      throw e;
    } finally {
      FS.hashAddNode(old_node);
    }
  },
  rmdir: (path) => {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, true);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.rmdir) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.rmdir(parent, name);
    FS.destroyNode(node);
  },
  readdir: (path) => {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    if (!node.node_ops.readdir) {
      throw new FS.ErrnoError(54);
    }
    return node.node_ops.readdir(node);
  },
  unlink: (path) => {
    var lookup = FS.lookupPath(path, { parent: true });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, false);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.unlink) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.unlink(parent, name);
    FS.destroyNode(node);
  },
  readlink: (path) => {
    var lookup = FS.lookupPath(path);
    var link = lookup.node;
    if (!link) {
      throw new FS.ErrnoError(44);
    }
    if (!link.node_ops.readlink) {
      throw new FS.ErrnoError(28);
    }
    return PATH_FS.resolve(
      FS.getPath(link.parent),
      link.node_ops.readlink(link),
    );
  },
  stat: (path, dontFollow) => {
    var lookup = FS.lookupPath(path, { follow: !dontFollow });
    var node = lookup.node;
    if (!node) {
      throw new FS.ErrnoError(44);
    }
    if (!node.node_ops.getattr) {
      throw new FS.ErrnoError(63);
    }
    return node.node_ops.getattr(node);
  },
  lstat: (path) => {
    return FS.stat(path, true);
  },
  chmod: (path, mode, dontFollow) => {
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(63);
    }
    node.node_ops.setattr(node, {
      mode: (mode & 4095) | (node.mode & ~4095),
      timestamp: Date.now(),
    });
  },
  lchmod: (path, mode) => {
    FS.chmod(path, mode, true);
  },
  fchmod: (fd, mode) => {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    FS.chmod(stream.node, mode);
  },
  chown: (path, uid, gid, dontFollow) => {
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, { follow: !dontFollow });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(63);
    }
    node.node_ops.setattr(node, { timestamp: Date.now() });
  },
  lchown: (path, uid, gid) => {
    FS.chown(path, uid, gid, true);
  },
  fchown: (fd, uid, gid) => {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    FS.chown(stream.node, uid, gid);
  },
  truncate: (path, len) => {
    if (len < 0) {
      throw new FS.ErrnoError(28);
    }
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, { follow: true });
      node = lookup.node;
    } else {
      node = path;
    }
    if (!node.node_ops.setattr) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isDir(node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!FS.isFile(node.mode)) {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.nodePermissions(node, "w");
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    node.node_ops.setattr(node, { size: len, timestamp: Date.now() });
  },
  ftruncate: (fd, len) => {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(28);
    }
    FS.truncate(stream.node, len);
  },
  utime: (path, atime, mtime) => {
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    node.node_ops.setattr(node, { timestamp: Math.max(atime, mtime) });
  },
  open: (path, flags, mode, fd_start, fd_end) => {
    if (path === "") {
      throw new FS.ErrnoError(44);
    }
    flags = typeof flags == "string" ? FS.modeStringToFlags(flags) : flags;
    mode = typeof mode == "undefined" ? 438 : mode;
    if (flags & 64) {
      mode = (mode & 4095) | 32768;
    } else {
      mode = 0;
    }
    var node;
    if (typeof path == "object") {
      node = path;
    } else {
      path = PATH.normalize(path);
      try {
        var lookup = FS.lookupPath(path, { follow: !(flags & 131072) });
        node = lookup.node;
      } catch (e) {}
    }
    var created = false;
    if (flags & 64) {
      if (node) {
        if (flags & 128) {
          throw new FS.ErrnoError(20);
        }
      } else {
        node = FS.mknod(path, mode, 0);
        created = true;
      }
    }
    if (!node) {
      throw new FS.ErrnoError(44);
    }
    if (FS.isChrdev(node.mode)) {
      flags &= ~512;
    }
    if (flags & 65536 && !FS.isDir(node.mode)) {
      throw new FS.ErrnoError(54);
    }
    if (!created) {
      var errCode = FS.mayOpen(node, flags);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    if (flags & 512) {
      FS.truncate(node, 0);
    }
    flags &= ~(128 | 512 | 131072);
    var stream = FS.createStream(
      {
        node: node,
        path: FS.getPath(node),
        flags: flags,
        seekable: true,
        position: 0,
        stream_ops: node.stream_ops,
        ungotten: [],
        error: false,
      },
      fd_start,
      fd_end,
    );
    if (stream.stream_ops.open) {
      stream.stream_ops.open(stream);
    }
    if (Module["logReadFiles"] && !(flags & 1)) {
      if (!FS.readFiles) FS.readFiles = {};
      if (!(path in FS.readFiles)) {
        FS.readFiles[path] = 1;
      }
    }
    return stream;
  },
  close: (stream) => {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (stream.getdents) stream.getdents = null;
    try {
      if (stream.stream_ops.close) {
        stream.stream_ops.close(stream);
      }
    } catch (e) {
      throw e;
    } finally {
      FS.closeStream(stream.fd);
    }
    stream.fd = null;
  },
  isClosed: (stream) => {
    return stream.fd === null;
  },
  llseek: (stream, offset, whence) => {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (!stream.seekable || !stream.stream_ops.llseek) {
      throw new FS.ErrnoError(70);
    }
    if (whence != 0 && whence != 1 && whence != 2) {
      throw new FS.ErrnoError(28);
    }
    stream.position = stream.stream_ops.llseek(stream, offset, whence);
    stream.ungotten = [];
    return stream.position;
  },
  read: (stream, buffer, offset, length, position) => {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.read) {
      throw new FS.ErrnoError(28);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesRead = stream.stream_ops.read(
      stream,
      buffer,
      offset,
      length,
      position,
    );
    if (!seeking) stream.position += bytesRead;
    return bytesRead;
  },
  write: (stream, buffer, offset, length, position, canOwn) => {
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.write) {
      throw new FS.ErrnoError(28);
    }
    if (stream.seekable && stream.flags & 1024) {
      FS.llseek(stream, 0, 2);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesWritten = stream.stream_ops.write(
      stream,
      buffer,
      offset,
      length,
      position,
      canOwn,
    );
    if (!seeking) stream.position += bytesWritten;
    return bytesWritten;
  },
  allocate: (stream, offset, length) => {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (offset < 0 || length <= 0) {
      throw new FS.ErrnoError(28);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(8);
    }
    if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(43);
    }
    if (!stream.stream_ops.allocate) {
      throw new FS.ErrnoError(138);
    }
    stream.stream_ops.allocate(stream, offset, length);
  },
  mmap: (stream, address, length, position, prot, flags) => {
    if (
      (prot & 2) !== 0 &&
      (flags & 2) === 0 &&
      (stream.flags & 2097155) !== 2
    ) {
      throw new FS.ErrnoError(2);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(2);
    }
    if (!stream.stream_ops.mmap) {
      throw new FS.ErrnoError(43);
    }
    return stream.stream_ops.mmap(
      stream,
      address,
      length,
      position,
      prot,
      flags,
    );
  },
  msync: (stream, buffer, offset, length, mmapFlags) => {
    if (!stream || !stream.stream_ops.msync) {
      return 0;
    }
    return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
  },
  munmap: (stream) => 0,
  ioctl: (stream, cmd, arg) => {
    if (!stream.stream_ops.ioctl) {
      throw new FS.ErrnoError(59);
    }
    return stream.stream_ops.ioctl(stream, cmd, arg);
  },
  readFile: (path, opts = {}) => {
    opts.flags = opts.flags || 0;
    opts.encoding = opts.encoding || "binary";
    if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
      throw new Error('Invalid encoding type "' + opts.encoding + '"');
    }
    var ret;
    var stream = FS.open(path, opts.flags);
    var stat = FS.stat(path);
    var length = stat.size;
    var buf = new Uint8Array(length);
    FS.read(stream, buf, 0, length, 0);
    if (opts.encoding === "utf8") {
      ret = UTF8ArrayToString(buf, 0);
    } else if (opts.encoding === "binary") {
      ret = buf;
    }
    FS.close(stream);
    return ret;
  },
  writeFile: (path, data, opts = {}) => {
    opts.flags = opts.flags || 577;
    var stream = FS.open(path, opts.flags, opts.mode);
    if (typeof data == "string") {
      var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
      var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
      FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
    } else if (ArrayBuffer.isView(data)) {
      FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
    } else {
      throw new Error("Unsupported data type");
    }
    FS.close(stream);
  },
  cwd: () => FS.currentPath,
  chdir: (path) => {
    var lookup = FS.lookupPath(path, { follow: true });
    if (lookup.node === null) {
      throw new FS.ErrnoError(44);
    }
    if (!FS.isDir(lookup.node.mode)) {
      throw new FS.ErrnoError(54);
    }
    var errCode = FS.nodePermissions(lookup.node, "x");
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    FS.currentPath = lookup.path;
  },
  createDefaultDirectories: () => {
    FS.mkdir("/tmp");
    FS.mkdir("/home");
    FS.mkdir("/home/web_user");
  },
  createDefaultDevices: () => {
    FS.mkdir("/dev");
    FS.registerDevice(FS.makedev(1, 3), {
      read: () => 0,
      write: (stream, buffer, offset, length, pos) => length,
    });
    FS.mkdev("/dev/null", FS.makedev(1, 3));
    TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
    TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
    FS.mkdev("/dev/tty", FS.makedev(5, 0));
    FS.mkdev("/dev/tty1", FS.makedev(6, 0));
    var random_device = getRandomDevice();
    FS.createDevice("/dev", "random", random_device);
    FS.createDevice("/dev", "urandom", random_device);
    FS.mkdir("/dev/shm");
    FS.mkdir("/dev/shm/tmp");
  },
  createSpecialDirectories: () => {
    FS.mkdir("/proc");
    var proc_self = FS.mkdir("/proc/self");
    FS.mkdir("/proc/self/fd");
    FS.mount(
      {
        mount: () => {
          var node = FS.createNode(proc_self, "fd", 16384 | 511, 73);
          node.node_ops = {
            lookup: (parent, name) => {
              var fd = +name;
              var stream = FS.getStream(fd);
              if (!stream) throw new FS.ErrnoError(8);
              var ret = {
                parent: null,
                mount: { mountpoint: "fake" },
                node_ops: { readlink: () => stream.path },
              };
              ret.parent = ret;
              return ret;
            },
          };
          return node;
        },
      },
      {},
      "/proc/self/fd",
    );
  },
  createStandardStreams: () => {
    if (Module["stdin"]) {
      FS.createDevice("/dev", "stdin", Module["stdin"]);
    } else {
      FS.symlink("/dev/tty", "/dev/stdin");
    }
    if (Module["stdout"]) {
      FS.createDevice("/dev", "stdout", null, Module["stdout"]);
    } else {
      FS.symlink("/dev/tty", "/dev/stdout");
    }
    if (Module["stderr"]) {
      FS.createDevice("/dev", "stderr", null, Module["stderr"]);
    } else {
      FS.symlink("/dev/tty1", "/dev/stderr");
    }
    var stdin = FS.open("/dev/stdin", 0);
    var stdout = FS.open("/dev/stdout", 1);
    var stderr = FS.open("/dev/stderr", 1);
    assert(stdin.fd === 0, "invalid handle for stdin (" + stdin.fd + ")");
    assert(stdout.fd === 1, "invalid handle for stdout (" + stdout.fd + ")");
    assert(stderr.fd === 2, "invalid handle for stderr (" + stderr.fd + ")");
  },
  ensureErrnoError: () => {
    if (FS.ErrnoError) return;
    FS.ErrnoError = function ErrnoError(errno, node) {
      this.node = node;
      this.setErrno = function (errno) {
        this.errno = errno;
        for (var key in ERRNO_CODES) {
          if (ERRNO_CODES[key] === errno) {
            this.code = key;
            break;
          }
        }
      };
      this.setErrno(errno);
      this.message = ERRNO_MESSAGES[errno];
      if (this.stack) {
        Object.defineProperty(this, "stack", {
          value: new Error().stack,
          writable: true,
        });
        this.stack = demangleAll(this.stack);
      }
    };
    FS.ErrnoError.prototype = new Error();
    FS.ErrnoError.prototype.constructor = FS.ErrnoError;
    [44].forEach((code) => {
      FS.genericErrors[code] = new FS.ErrnoError(code);
      FS.genericErrors[code].stack = "<generic error, no stack>";
    });
  },
  staticInit: () => {
    FS.ensureErrnoError();
    FS.nameTable = new Array(4096);
    FS.mount(MEMFS, {}, "/");
    FS.createDefaultDirectories();
    FS.createDefaultDevices();
    FS.createSpecialDirectories();
    FS.filesystems = { MEMFS: MEMFS };
  },
  init: (input, output, error) => {
    assert(
      !FS.init.initialized,
      "FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)",
    );
    FS.init.initialized = true;
    FS.ensureErrnoError();
    Module["stdin"] = input || Module["stdin"];
    Module["stdout"] = output || Module["stdout"];
    Module["stderr"] = error || Module["stderr"];
    FS.createStandardStreams();
  },
  quit: () => {
    FS.init.initialized = false;
    ___stdio_exit();
    for (var i = 0; i < FS.streams.length; i++) {
      var stream = FS.streams[i];
      if (!stream) {
        continue;
      }
      FS.close(stream);
    }
  },
  getMode: (canRead, canWrite) => {
    var mode = 0;
    if (canRead) mode |= 292 | 73;
    if (canWrite) mode |= 146;
    return mode;
  },
  findObject: (path, dontResolveLastLink) => {
    var ret = FS.analyzePath(path, dontResolveLastLink);
    if (ret.exists) {
      return ret.object;
    } else {
      return null;
    }
  },
  analyzePath: (path, dontResolveLastLink) => {
    try {
      var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      path = lookup.path;
    } catch (e) {}
    var ret = {
      isRoot: false,
      exists: false,
      error: 0,
      name: null,
      path: null,
      object: null,
      parentExists: false,
      parentPath: null,
      parentObject: null,
    };
    try {
      var lookup = FS.lookupPath(path, { parent: true });
      ret.parentExists = true;
      ret.parentPath = lookup.path;
      ret.parentObject = lookup.node;
      ret.name = PATH.basename(path);
      lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
      ret.exists = true;
      ret.path = lookup.path;
      ret.object = lookup.node;
      ret.name = lookup.node.name;
      ret.isRoot = lookup.path === "/";
    } catch (e) {
      ret.error = e.errno;
    }
    return ret;
  },
  createPath: (parent, path, canRead, canWrite) => {
    parent = typeof parent == "string" ? parent : FS.getPath(parent);
    var parts = path.split("/").reverse();
    while (parts.length) {
      var part = parts.pop();
      if (!part) continue;
      var current = PATH.join2(parent, part);
      try {
        FS.mkdir(current);
      } catch (e) {}
      parent = current;
    }
    return current;
  },
  createFile: (parent, name, properties, canRead, canWrite) => {
    var path = PATH.join2(
      typeof parent == "string" ? parent : FS.getPath(parent),
      name,
    );
    var mode = FS.getMode(canRead, canWrite);
    return FS.create(path, mode);
  },
  createDataFile: (parent, name, data, canRead, canWrite, canOwn) => {
    var path = name;
    if (parent) {
      parent = typeof parent == "string" ? parent : FS.getPath(parent);
      path = name ? PATH.join2(parent, name) : parent;
    }
    var mode = FS.getMode(canRead, canWrite);
    var node = FS.create(path, mode);
    if (data) {
      if (typeof data == "string") {
        var arr = new Array(data.length);
        for (var i = 0, len = data.length; i < len; ++i)
          arr[i] = data.charCodeAt(i);
        data = arr;
      }
      FS.chmod(node, mode | 146);
      var stream = FS.open(node, 577);
      FS.write(stream, data, 0, data.length, 0, canOwn);
      FS.close(stream);
      FS.chmod(node, mode);
    }
    return node;
  },
  createDevice: (parent, name, input, output) => {
    var path = PATH.join2(
      typeof parent == "string" ? parent : FS.getPath(parent),
      name,
    );
    var mode = FS.getMode(!!input, !!output);
    if (!FS.createDevice.major) FS.createDevice.major = 64;
    var dev = FS.makedev(FS.createDevice.major++, 0);
    FS.registerDevice(dev, {
      open: (stream) => {
        stream.seekable = false;
      },
      close: (stream) => {
        if (output && output.buffer && output.buffer.length) {
          output(10);
        }
      },
      read: (stream, buffer, offset, length, pos) => {
        var bytesRead = 0;
        for (var i = 0; i < length; i++) {
          var result;
          try {
            result = input();
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (result === undefined && bytesRead === 0) {
            throw new FS.ErrnoError(6);
          }
          if (result === null || result === undefined) break;
          bytesRead++;
          buffer[offset + i] = result;
        }
        if (bytesRead) {
          stream.node.timestamp = Date.now();
        }
        return bytesRead;
      },
      write: (stream, buffer, offset, length, pos) => {
        for (var i = 0; i < length; i++) {
          try {
            output(buffer[offset + i]);
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
        if (length) {
          stream.node.timestamp = Date.now();
        }
        return i;
      },
    });
    return FS.mkdev(path, mode, dev);
  },
  forceLoadFile: (obj) => {
    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
    if (typeof XMLHttpRequest != "undefined") {
      throw new Error(
        "Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.",
      );
    } else if (read_) {
      try {
        obj.contents = intArrayFromString(read_(obj.url), true);
        obj.usedBytes = obj.contents.length;
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
    } else {
      throw new Error("Cannot load without read() or XMLHttpRequest.");
    }
  },
  createLazyFile: (parent, name, url, canRead, canWrite) => {
    function LazyUint8Array() {
      this.lengthKnown = false;
      this.chunks = [];
    }
    LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
      if (idx > this.length - 1 || idx < 0) {
        return undefined;
      }
      var chunkOffset = idx % this.chunkSize;
      var chunkNum = (idx / this.chunkSize) | 0;
      return this.getter(chunkNum)[chunkOffset];
    };
    LazyUint8Array.prototype.setDataGetter =
      function LazyUint8Array_setDataGetter(getter) {
        this.getter = getter;
      };
    LazyUint8Array.prototype.cacheLength =
      function LazyUint8Array_cacheLength() {
        var xhr = new XMLHttpRequest();
        xhr.open("HEAD", url, false);
        xhr.send(null);
        if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
          throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
        var datalength = Number(xhr.getResponseHeader("Content-length"));
        var header;
        var hasByteServing =
          (header = xhr.getResponseHeader("Accept-Ranges")) &&
          header === "bytes";
        var usesGzip =
          (header = xhr.getResponseHeader("Content-Encoding")) &&
          header === "gzip";
        var chunkSize = 1024 * 1024;
        if (!hasByteServing) chunkSize = datalength;
        var doXHR = (from, to) => {
          if (from > to)
            throw new Error(
              "invalid range (" + from + ", " + to + ") or no bytes requested!",
            );
          if (to > datalength - 1)
            throw new Error(
              "only " + datalength + " bytes available! programmer error!",
            );
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          if (datalength !== chunkSize)
            xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
          xhr.responseType = "arraybuffer";
          if (xhr.overrideMimeType) {
            xhr.overrideMimeType("text/plain; charset=x-user-defined");
          }
          xhr.send(null);
          if (!((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304))
            throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          if (xhr.response !== undefined) {
            return new Uint8Array(xhr.response || []);
          } else {
            return intArrayFromString(xhr.responseText || "", true);
          }
        };
        var lazyArray = this;
        lazyArray.setDataGetter((chunkNum) => {
          var start = chunkNum * chunkSize;
          var end = (chunkNum + 1) * chunkSize - 1;
          end = Math.min(end, datalength - 1);
          if (typeof lazyArray.chunks[chunkNum] == "undefined") {
            lazyArray.chunks[chunkNum] = doXHR(start, end);
          }
          if (typeof lazyArray.chunks[chunkNum] == "undefined")
            throw new Error("doXHR failed!");
          return lazyArray.chunks[chunkNum];
        });
        if (usesGzip || !datalength) {
          chunkSize = datalength = 1;
          datalength = this.getter(0).length;
          chunkSize = datalength;
          out(
            "LazyFiles on gzip forces download of the whole file when length is accessed",
          );
        }
        this._length = datalength;
        this._chunkSize = chunkSize;
        this.lengthKnown = true;
      };
    if (typeof XMLHttpRequest != "undefined") {
      if (!ENVIRONMENT_IS_WORKER)
        throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
      var lazyArray = new LazyUint8Array();
      Object.defineProperties(lazyArray, {
        length: {
          get: function () {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._length;
          },
        },
        chunkSize: {
          get: function () {
            if (!this.lengthKnown) {
              this.cacheLength();
            }
            return this._chunkSize;
          },
        },
      });
      var properties = { isDevice: false, contents: lazyArray };
    } else {
      var properties = { isDevice: false, url: url };
    }
    var node = FS.createFile(parent, name, properties, canRead, canWrite);
    if (properties.contents) {
      node.contents = properties.contents;
    } else if (properties.url) {
      node.contents = null;
      node.url = properties.url;
    }
    Object.defineProperties(node, {
      usedBytes: {
        get: function () {
          return this.contents.length;
        },
      },
    });
    var stream_ops = {};
    var keys = Object.keys(node.stream_ops);
    keys.forEach((key) => {
      var fn = node.stream_ops[key];
      stream_ops[key] = function forceLoadLazyFile() {
        FS.forceLoadFile(node);
        return fn.apply(null, arguments);
      };
    });
    stream_ops.read = (stream, buffer, offset, length, position) => {
      FS.forceLoadFile(node);
      var contents = stream.node.contents;
      if (position >= contents.length) return 0;
      var size = Math.min(contents.length - position, length);
      assert(size >= 0);
      if (contents.slice) {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents[position + i];
        }
      } else {
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents.get(position + i);
        }
      }
      return size;
    };
    node.stream_ops = stream_ops;
    return node;
  },
  createPreloadedFile: (
    parent,
    name,
    url,
    canRead,
    canWrite,
    onload,
    onerror,
    dontCreateFile,
    canOwn,
    preFinish,
  ) => {
    var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
    var dep = getUniqueRunDependency("cp " + fullname);
    function processData(byteArray) {
      function finish(byteArray) {
        if (preFinish) preFinish();
        if (!dontCreateFile) {
          FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
        }
        if (onload) onload();
        removeRunDependency(dep);
      }
      if (
        Browser.handledByPreloadPlugin(byteArray, fullname, finish, () => {
          if (onerror) onerror();
          removeRunDependency(dep);
        })
      ) {
        return;
      }
      finish(byteArray);
    }
    addRunDependency(dep);
    if (typeof url == "string") {
      asyncLoad(url, (byteArray) => processData(byteArray), onerror);
    } else {
      processData(url);
    }
  },
  indexedDB: () => {
    return (
      window.indexedDB ||
      window.mozIndexedDB ||
      window.webkitIndexedDB ||
      window.msIndexedDB
    );
  },
  DB_NAME: () => {
    return "EM_FS_" + window.location.pathname;
  },
  DB_VERSION: 20,
  DB_STORE_NAME: "FILE_DATA",
  saveFilesToDB: (paths, onload, onerror) => {
    onload = onload || (() => {});
    onerror = onerror || (() => {});
    var indexedDB = FS.indexedDB();
    try {
      var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
    } catch (e) {
      return onerror(e);
    }
    openRequest.onupgradeneeded = () => {
      out("creating db");
      var db = openRequest.result;
      db.createObjectStore(FS.DB_STORE_NAME);
    };
    openRequest.onsuccess = () => {
      var db = openRequest.result;
      var transaction = db.transaction([FS.DB_STORE_NAME], "readwrite");
      var files = transaction.objectStore(FS.DB_STORE_NAME);
      var ok = 0,
        fail = 0,
        total = paths.length;
      function finish() {
        if (fail == 0) onload();
        else onerror();
      }
      paths.forEach((path) => {
        var putRequest = files.put(FS.analyzePath(path).object.contents, path);
        putRequest.onsuccess = () => {
          ok++;
          if (ok + fail == total) finish();
        };
        putRequest.onerror = () => {
          fail++;
          if (ok + fail == total) finish();
        };
      });
      transaction.onerror = onerror;
    };
    openRequest.onerror = onerror;
  },
  loadFilesFromDB: (paths, onload, onerror) => {
    onload = onload || (() => {});
    onerror = onerror || (() => {});
    var indexedDB = FS.indexedDB();
    try {
      var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
    } catch (e) {
      return onerror(e);
    }
    openRequest.onupgradeneeded = onerror;
    openRequest.onsuccess = () => {
      var db = openRequest.result;
      try {
        var transaction = db.transaction([FS.DB_STORE_NAME], "readonly");
      } catch (e) {
        onerror(e);
        return;
      }
      var files = transaction.objectStore(FS.DB_STORE_NAME);
      var ok = 0,
        fail = 0,
        total = paths.length;
      function finish() {
        if (fail == 0) onload();
        else onerror();
      }
      paths.forEach((path) => {
        var getRequest = files.get(path);
        getRequest.onsuccess = () => {
          if (FS.analyzePath(path).exists) {
            FS.unlink(path);
          }
          FS.createDataFile(
            PATH.dirname(path),
            PATH.basename(path),
            getRequest.result,
            true,
            true,
            true,
          );
          ok++;
          if (ok + fail == total) finish();
        };
        getRequest.onerror = () => {
          fail++;
          if (ok + fail == total) finish();
        };
      });
      transaction.onerror = onerror;
    };
    openRequest.onerror = onerror;
  },
  absolutePath: () => {
    abort("FS.absolutePath has been removed; use PATH_FS.resolve instead");
  },
  createFolder: () => {
    abort("FS.createFolder has been removed; use FS.mkdir instead");
  },
  createLink: () => {
    abort("FS.createLink has been removed; use FS.symlink instead");
  },
  joinPath: () => {
    abort("FS.joinPath has been removed; use PATH.join instead");
  },
  mmapAlloc: () => {
    abort("FS.mmapAlloc has been replaced by the top level function mmapAlloc");
  },
  standardizePath: () => {
    abort("FS.standardizePath has been removed; use PATH.normalize instead");
  },
};
var SYSCALLS = {
  DEFAULT_POLLMASK: 5,
  calculateAt: function (dirfd, path, allowEmpty) {
    if (path[0] === "/") {
      return path;
    }
    var dir;
    if (dirfd === -100) {
      dir = FS.cwd();
    } else {
      var dirstream = FS.getStream(dirfd);
      if (!dirstream) throw new FS.ErrnoError(8);
      dir = dirstream.path;
    }
    if (path.length == 0) {
      if (!allowEmpty) {
        throw new FS.ErrnoError(44);
      }
      return dir;
    }
    return PATH.join2(dir, path);
  },
  doStat: function (func, path, buf) {
    try {
      var stat = func(path);
    } catch (e) {
      if (
        e &&
        e.node &&
        PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))
      ) {
        return -54;
      }
      throw e;
    }
    HEAP32[buf >> 2] = stat.dev;
    HEAP32[(buf + 4) >> 2] = 0;
    HEAP32[(buf + 8) >> 2] = stat.ino;
    HEAP32[(buf + 12) >> 2] = stat.mode;
    HEAP32[(buf + 16) >> 2] = stat.nlink;
    HEAP32[(buf + 20) >> 2] = stat.uid;
    HEAP32[(buf + 24) >> 2] = stat.gid;
    HEAP32[(buf + 28) >> 2] = stat.rdev;
    HEAP32[(buf + 32) >> 2] = 0;
    (tempI64 = [
      stat.size >>> 0,
      ((tempDouble = stat.size),
      +Math.abs(tempDouble) >= 1
        ? tempDouble > 0
          ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>>
            0
          : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>>
            0
        : 0),
    ]),
      (HEAP32[(buf + 40) >> 2] = tempI64[0]),
      (HEAP32[(buf + 44) >> 2] = tempI64[1]);
    HEAP32[(buf + 48) >> 2] = 4096;
    HEAP32[(buf + 52) >> 2] = stat.blocks;
    HEAP32[(buf + 56) >> 2] = (stat.atime.getTime() / 1e3) | 0;
    HEAP32[(buf + 60) >> 2] = 0;
    HEAP32[(buf + 64) >> 2] = (stat.mtime.getTime() / 1e3) | 0;
    HEAP32[(buf + 68) >> 2] = 0;
    HEAP32[(buf + 72) >> 2] = (stat.ctime.getTime() / 1e3) | 0;
    HEAP32[(buf + 76) >> 2] = 0;
    (tempI64 = [
      stat.ino >>> 0,
      ((tempDouble = stat.ino),
      +Math.abs(tempDouble) >= 1
        ? tempDouble > 0
          ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>>
            0
          : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>>
            0
        : 0),
    ]),
      (HEAP32[(buf + 80) >> 2] = tempI64[0]),
      (HEAP32[(buf + 84) >> 2] = tempI64[1]);
    return 0;
  },
  doMsync: function (addr, stream, len, flags, offset) {
    var buffer = HEAPU8.slice(addr, addr + len);
    FS.msync(stream, buffer, offset, len, flags);
  },
  doMkdir: function (path, mode) {
    path = PATH.normalize(path);
    if (path[path.length - 1] === "/") path = path.substr(0, path.length - 1);
    FS.mkdir(path, mode, 0);
    return 0;
  },
  doMknod: function (path, mode, dev) {
    switch (mode & 61440) {
      case 32768:
      case 8192:
      case 24576:
      case 4096:
      case 49152:
        break;
      default:
        return -28;
    }
    FS.mknod(path, mode, dev);
    return 0;
  },
  doReadlink: function (path, buf, bufsize) {
    if (bufsize <= 0) return -28;
    var ret = FS.readlink(path);
    var len = Math.min(bufsize, lengthBytesUTF8(ret));
    var endChar = HEAP8[buf + len];
    stringToUTF8(ret, buf, bufsize + 1);
    HEAP8[buf + len] = endChar;
    return len;
  },
  doAccess: function (path, amode) {
    if (amode & ~7) {
      return -28;
    }
    var lookup = FS.lookupPath(path, { follow: true });
    var node = lookup.node;
    if (!node) {
      return -44;
    }
    var perms = "";
    if (amode & 4) perms += "r";
    if (amode & 2) perms += "w";
    if (amode & 1) perms += "x";
    if (perms && FS.nodePermissions(node, perms)) {
      return -2;
    }
    return 0;
  },
  doDup: function (path, flags, suggestFD) {
    var suggest = FS.getStream(suggestFD);
    if (suggest) FS.close(suggest);
    return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
  },
  doReadv: function (stream, iov, iovcnt, offset) {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAP32[(iov + i * 8) >> 2];
      var len = HEAP32[(iov + (i * 8 + 4)) >> 2];
      var curr = FS.read(stream, HEAP8, ptr, len, offset);
      if (curr < 0) return -1;
      ret += curr;
      if (curr < len) break;
    }
    return ret;
  },
  doWritev: function (stream, iov, iovcnt, offset) {
    var ret = 0;
    for (var i = 0; i < iovcnt; i++) {
      var ptr = HEAP32[(iov + i * 8) >> 2];
      var len = HEAP32[(iov + (i * 8 + 4)) >> 2];
      var curr = FS.write(stream, HEAP8, ptr, len, offset);
      if (curr < 0) return -1;
      ret += curr;
    }
    return ret;
  },
  varargs: undefined,
  get: function () {
    assert(SYSCALLS.varargs != undefined);
    SYSCALLS.varargs += 4;
    var ret = HEAP32[(SYSCALLS.varargs - 4) >> 2];
    return ret;
  },
  getStr: function (ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
  },
  getStreamFromFD: function (fd) {
    var stream = FS.getStream(fd);
    if (!stream) throw new FS.ErrnoError(8);
    return stream;
  },
  get64: function (low, high) {
    if (low >= 0) assert(high === 0);
    else assert(high === -1);
    return low;
  },
};
function ___syscall_fcntl64(fd, cmd, varargs) {
  SYSCALLS.varargs = varargs;
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    switch (cmd) {
      case 0: {
        var arg = SYSCALLS.get();
        if (arg < 0) {
          return -28;
        }
        var newStream;
        newStream = FS.open(stream.path, stream.flags, 0, arg);
        return newStream.fd;
      }
      case 1:
      case 2:
        return 0;
      case 3:
        return stream.flags;
      case 4: {
        var arg = SYSCALLS.get();
        stream.flags |= arg;
        return 0;
      }
      case 5: {
        var arg = SYSCALLS.get();
        var offset = 0;
        HEAP16[(arg + offset) >> 1] = 2;
        return 0;
      }
      case 6:
      case 7:
        return 0;
      case 16:
      case 8:
        return -28;
      case 9:
        setErrNo(28);
        return -1;
      default: {
        return -28;
      }
    }
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}
function ___syscall_fstat64(fd, buf) {
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    return SYSCALLS.doStat(FS.stat, stream.path, buf);
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}
function ___syscall_ioctl(fd, op, varargs) {
  SYSCALLS.varargs = varargs;
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    switch (op) {
      case 21509:
      case 21505: {
        if (!stream.tty) return -59;
        return 0;
      }
      case 21510:
      case 21511:
      case 21512:
      case 21506:
      case 21507:
      case 21508: {
        if (!stream.tty) return -59;
        return 0;
      }
      case 21519: {
        if (!stream.tty) return -59;
        var argp = SYSCALLS.get();
        HEAP32[argp >> 2] = 0;
        return 0;
      }
      case 21520: {
        if (!stream.tty) return -59;
        return -28;
      }
      case 21531: {
        var argp = SYSCALLS.get();
        return FS.ioctl(stream, op, argp);
      }
      case 21523: {
        if (!stream.tty) return -59;
        return 0;
      }
      case 21524: {
        if (!stream.tty) return -59;
        return 0;
      }
      default:
        abort("bad ioctl syscall " + op);
    }
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}
function ___syscall_open(path, flags, varargs) {
  SYSCALLS.varargs = varargs;
  try {
    var pathname = SYSCALLS.getStr(path);
    var mode = varargs ? SYSCALLS.get() : 0;
    var stream = FS.open(pathname, flags, mode);
    return stream.fd;
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}
function __mmap_js(addr, len, prot, flags, fd, off, allocated, builtin) {
  try {
    var info = FS.getStream(fd);
    if (!info) return -8;
    var res = FS.mmap(info, addr, len, off, prot, flags);
    var ptr = res.ptr;
    HEAP32[allocated >> 2] = res.allocated;
    return ptr;
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}
function __munmap_js(addr, len, prot, flags, fd, offset) {
  try {
    var stream = FS.getStream(fd);
    if (stream) {
      if (prot & 2) {
        SYSCALLS.doMsync(addr, stream, len, flags, offset);
      }
      FS.munmap(stream);
    }
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return -e.errno;
  }
}
function _abort() {
  abort("native code called abort()");
}
function _emscripten_set_main_loop_timing(mode, value) {
  Browser.mainLoop.timingMode = mode;
  Browser.mainLoop.timingValue = value;
  if (!Browser.mainLoop.func) {
    err(
      "emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.",
    );
    return 1;
  }
  if (!Browser.mainLoop.running) {
    Browser.mainLoop.running = true;
  }
  if (mode == 0) {
    Browser.mainLoop.scheduler =
      function Browser_mainLoop_scheduler_setTimeout() {
        var timeUntilNextTick =
          Math.max(
            0,
            Browser.mainLoop.tickStartTime + value - _emscripten_get_now(),
          ) | 0;
        setTimeout(Browser.mainLoop.runner, timeUntilNextTick);
      };
    Browser.mainLoop.method = "timeout";
  } else if (mode == 1) {
    Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
      Browser.requestAnimationFrame(Browser.mainLoop.runner);
    };
    Browser.mainLoop.method = "rAF";
  } else if (mode == 2) {
    if (typeof setImmediate == "undefined") {
      var setImmediates = [];
      var emscriptenMainLoopMessageId = "setimmediate";
      var Browser_setImmediate_messageHandler = function (event) {
        if (
          event.data === emscriptenMainLoopMessageId ||
          event.data.target === emscriptenMainLoopMessageId
        ) {
          event.stopPropagation();
          setImmediates.shift()();
        }
      };
      addEventListener("message", Browser_setImmediate_messageHandler, true);
      setImmediate = function Browser_emulated_setImmediate(func) {
        setImmediates.push(func);
        if (ENVIRONMENT_IS_WORKER) {
          if (Module["setImmediates"] === undefined)
            Module["setImmediates"] = [];
          Module["setImmediates"].push(func);
          postMessage({ target: emscriptenMainLoopMessageId });
        } else postMessage(emscriptenMainLoopMessageId, "*");
      };
    }
    Browser.mainLoop.scheduler =
      function Browser_mainLoop_scheduler_setImmediate() {
        setImmediate(Browser.mainLoop.runner);
      };
    Browser.mainLoop.method = "immediate";
  }
  return 0;
}
var _emscripten_get_now;
_emscripten_get_now = () => performance.now();
function runtimeKeepalivePush() {
  runtimeKeepaliveCounter += 1;
}
function _exit(status) {
  for (let i = 0; i < instructions.length; i++){
    instructions[i]._rowVariant = '';
  }
  if (status === 1){
    let init_index = instructions.findIndex(insn => insn.Address === "0x" + entry_elf);
    if(init_index !== undefined)
      instructions[init_index]._rowVariant = 'success';
  }
  exit(status);
}
function maybeExit() {
  if (!keepRuntimeAlive()) {
    try {
      _exit(EXITSTATUS);
    } catch (e) {
      handleException(e);
    }
  }
}
function setMainLoop(
  browserIterationFunc,
  fps,
  simulateInfiniteLoop,
  arg,
  noSetTiming,
) {
  assert(
    !Browser.mainLoop.func,
    "emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.",
  );
  Browser.mainLoop.func = browserIterationFunc;
  Browser.mainLoop.arg = arg;
  var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
  function checkIsRunning() {
    if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) {
      maybeExit();
      return false;
    }
    return true;
  }
  Browser.mainLoop.running = false;
  Browser.mainLoop.runner = function Browser_mainLoop_runner() {
    if (ABORT) return;
    if (Browser.mainLoop.queue.length > 0) {
      var start = Date.now();
      var blocker = Browser.mainLoop.queue.shift();
      blocker.func(blocker.arg);
      if (Browser.mainLoop.remainingBlockers) {
        var remaining = Browser.mainLoop.remainingBlockers;
        var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
        if (blocker.counted) {
          Browser.mainLoop.remainingBlockers = next;
        } else {
          next = next + 0.5;
          Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9;
        }
      }
      out(
        'main loop blocker "' +
          blocker.name +
          '" took ' +
          (Date.now() - start) +
          " ms",
      );
      Browser.mainLoop.updateStatus();
      if (!checkIsRunning()) return;
      setTimeout(Browser.mainLoop.runner, 0);
      return;
    }
    if (!checkIsRunning()) return;
    Browser.mainLoop.currentFrameNumber =
      (Browser.mainLoop.currentFrameNumber + 1) | 0;
    if (
      Browser.mainLoop.timingMode == 1 &&
      Browser.mainLoop.timingValue > 1 &&
      Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0
    ) {
      Browser.mainLoop.scheduler();
      return;
    } else if (Browser.mainLoop.timingMode == 0) {
      Browser.mainLoop.tickStartTime = _emscripten_get_now();
    }
    if (Browser.mainLoop.method === "timeout" && Module.ctx) {
      warnOnce(
        "Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!",
      );
      Browser.mainLoop.method = "";
    }
    Browser.mainLoop.runIter(browserIterationFunc);
    checkStackCookie();
    if (!checkIsRunning()) return;
    if (typeof SDL == "object" && SDL.audio && SDL.audio.queueNewAudioData)
      SDL.audio.queueNewAudioData();
    Browser.mainLoop.scheduler();
  };
  if (!noSetTiming) {
    if (fps && fps > 0) _emscripten_set_main_loop_timing(0, 1e3 / fps);
    else _emscripten_set_main_loop_timing(1, 1);
    Browser.mainLoop.scheduler();
  }
  if (simulateInfiniteLoop) {
    throw "unwind";
  }
}
function callUserCallback(func, synchronous) {
  if (runtimeExited || ABORT) {
    err(
      "user callback triggered after runtime exited or application aborted.  Ignoring.",
    );
    return;
  }
  if (synchronous) {
    func();
    return;
  }
  try {
    func();
  } catch (e) {
    handleException(e);
  }
}
function runtimeKeepalivePop() {
  assert(runtimeKeepaliveCounter > 0);
  runtimeKeepaliveCounter -= 1;
}
function safeSetTimeout(func, timeout) {
  return setTimeout(function () {
    callUserCallback(func);
  }, timeout);
}
var Browser = {
  mainLoop: {
    running: false,
    scheduler: null,
    method: "",
    currentlyRunningMainloop: 0,
    func: null,
    arg: 0,
    timingMode: 0,
    timingValue: 0,
    currentFrameNumber: 0,
    queue: [],
    pause: function () {
      Browser.mainLoop.scheduler = null;
      Browser.mainLoop.currentlyRunningMainloop++;
    },
    resume: function () {
      Browser.mainLoop.currentlyRunningMainloop++;
      var timingMode = Browser.mainLoop.timingMode;
      var timingValue = Browser.mainLoop.timingValue;
      var func = Browser.mainLoop.func;
      Browser.mainLoop.func = null;
      setMainLoop(func, 0, false, Browser.mainLoop.arg, true);
      _emscripten_set_main_loop_timing(timingMode, timingValue);
      Browser.mainLoop.scheduler();
    },
    updateStatus: function () {
      if (Module["setStatus"]) {
        var message = Module["statusMessage"] || "Please wait...";
        var remaining = Browser.mainLoop.remainingBlockers;
        var expected = Browser.mainLoop.expectedBlockers;
        if (remaining) {
          if (remaining < expected) {
            Module["setStatus"](
              message + " (" + (expected - remaining) + "/" + expected + ")",
            );
          } else {
            Module["setStatus"](message);
          }
        } else {
          Module["setStatus"]("");
        }
      }
    },
    runIter: function (func) {
      if (ABORT) return;
      if (Module["preMainLoop"]) {
        var preRet = Module["preMainLoop"]();
        if (preRet === false) {
          return;
        }
      }
      callUserCallback(func);
      if (Module["postMainLoop"]) Module["postMainLoop"]();
    },
  },
  isFullscreen: false,
  pointerLock: false,
  moduleContextCreatedCallbacks: [],
  workers: [],
  init: function () {
    if (!Module["preloadPlugins"]) Module["preloadPlugins"] = [];
    if (Browser.initted) return;
    Browser.initted = true;
    try {
      new Blob();
      Browser.hasBlobConstructor = true;
    } catch (e) {
      Browser.hasBlobConstructor = false;
      out("warning: no blob constructor, cannot create blobs with mimetypes");
    }
    Browser.BlobBuilder =
      typeof MozBlobBuilder != "undefined"
        ? MozBlobBuilder
        : typeof WebKitBlobBuilder != "undefined"
          ? WebKitBlobBuilder
          : !Browser.hasBlobConstructor
            ? out("warning: no BlobBuilder")
            : null;
    Browser.URLObject =
      typeof window != "undefined"
        ? window.URL
          ? window.URL
          : window.webkitURL
        : undefined;
    if (!Module.noImageDecoding && typeof Browser.URLObject == "undefined") {
      out(
        "warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.",
      );
      Module.noImageDecoding = true;
    }
    var imagePlugin = {};
    imagePlugin["canHandle"] = function imagePlugin_canHandle(name) {
      return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
    };
    imagePlugin["handle"] = function imagePlugin_handle(
      byteArray,
      name,
      onload,
      onerror,
    ) {
      var b = null;
      if (Browser.hasBlobConstructor) {
        try {
          b = new Blob([byteArray], { type: Browser.getMimetype(name) });
          if (b.size !== byteArray.length) {
            b = new Blob([new Uint8Array(byteArray).buffer], {
              type: Browser.getMimetype(name),
            });
          }
        } catch (e) {
          warnOnce(
            "Blob constructor present but fails: " +
              e +
              "; falling back to blob builder",
          );
        }
      }
      if (!b) {
        var bb = new Browser.BlobBuilder();
        bb.append(new Uint8Array(byteArray).buffer);
        b = bb.getBlob();
      }
      var url = Browser.URLObject.createObjectURL(b);
      assert(
        typeof url == "string",
        "createObjectURL must return a url as a string",
      );
      var img = new Image();
      img.onload = () => {
        assert(img.complete, "Image " + name + " could not be decoded");
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        Module["preloadedImages"][name] = canvas;
        Browser.URLObject.revokeObjectURL(url);
        if (onload) onload(byteArray);
      };
      img.onerror = (event) => {
        out("Image " + url + " could not be decoded");
        if (onerror) onerror();
      };
      img.src = url;
    };
    Module["preloadPlugins"].push(imagePlugin);
    var audioPlugin = {};
    audioPlugin["canHandle"] = function audioPlugin_canHandle(name) {
      return (
        !Module.noAudioDecoding &&
        name.substr(-4) in { ".ogg": 1, ".wav": 1, ".mp3": 1 }
      );
    };
    audioPlugin["handle"] = function audioPlugin_handle(
      byteArray,
      name,
      onload,
      onerror,
    ) {
      var done = false;
      function finish(audio) {
        if (done) return;
        done = true;
        Module["preloadedAudios"][name] = audio;
        if (onload) onload(byteArray);
      }
      function fail() {
        if (done) return;
        done = true;
        Module["preloadedAudios"][name] = new Audio();
        if (onerror) onerror();
      }
      if (Browser.hasBlobConstructor) {
        try {
          var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
        } catch (e) {
          return fail();
        }
        var url = Browser.URLObject.createObjectURL(b);
        assert(
          typeof url == "string",
          "createObjectURL must return a url as a string",
        );
        var audio = new Audio();
        audio.addEventListener(
          "canplaythrough",
          function () {
            finish(audio);
          },
          false,
        );
        audio.onerror = function audio_onerror(event) {
          if (done) return;
          out(
            "warning: browser could not fully decode audio " +
              name +
              ", trying slower base64 approach",
          );
          function encode64(data) {
            var BASE =
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            var PAD = "=";
            var ret = "";
            var leftchar = 0;
            var leftbits = 0;
            for (var i = 0; i < data.length; i++) {
              leftchar = (leftchar << 8) | data[i];
              leftbits += 8;
              while (leftbits >= 6) {
                var curr = (leftchar >> (leftbits - 6)) & 63;
                leftbits -= 6;
                ret += BASE[curr];
              }
            }
            if (leftbits == 2) {
              ret += BASE[(leftchar & 3) << 4];
              ret += PAD + PAD;
            } else if (leftbits == 4) {
              ret += BASE[(leftchar & 15) << 2];
              ret += PAD;
            }
            return ret;
          }
          audio.src =
            "data:audio/x-" +
            name.substr(-3) +
            ";base64," +
            encode64(byteArray);
          finish(audio);
        };
        audio.src = url;
        safeSetTimeout(function () {
          finish(audio);
        }, 1e4);
      } else {
        return fail();
      }
    };
    Module["preloadPlugins"].push(audioPlugin);
    function pointerLockChange() {
      Browser.pointerLock =
        document["pointerLockElement"] === Module["canvas"] ||
        document["mozPointerLockElement"] === Module["canvas"] ||
        document["webkitPointerLockElement"] === Module["canvas"] ||
        document["msPointerLockElement"] === Module["canvas"];
    }
    var canvas = Module["canvas"];
    if (canvas) {
      canvas.requestPointerLock =
        canvas["requestPointerLock"] ||
        canvas["mozRequestPointerLock"] ||
        canvas["webkitRequestPointerLock"] ||
        canvas["msRequestPointerLock"] ||
        function () {};
      canvas.exitPointerLock =
        document["exitPointerLock"] ||
        document["mozExitPointerLock"] ||
        document["webkitExitPointerLock"] ||
        document["msExitPointerLock"] ||
        function () {};
      canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
      document.addEventListener("pointerlockchange", pointerLockChange, false);
      document.addEventListener(
        "mozpointerlockchange",
        pointerLockChange,
        false,
      );
      document.addEventListener(
        "webkitpointerlockchange",
        pointerLockChange,
        false,
      );
      document.addEventListener(
        "mspointerlockchange",
        pointerLockChange,
        false,
      );
      if (Module["elementPointerLock"]) {
        canvas.addEventListener(
          "click",
          function (ev) {
            if (!Browser.pointerLock && Module["canvas"].requestPointerLock) {
              Module["canvas"].requestPointerLock();
              ev.preventDefault();
            }
          },
          false,
        );
      }
    }
  },
  handledByPreloadPlugin: function (byteArray, fullname, finish, onerror) {
    Browser.init();
    var handled = false;
    Module["preloadPlugins"].forEach(function (plugin) {
      if (handled) return;
      if (plugin["canHandle"](fullname)) {
        plugin["handle"](byteArray, fullname, finish, onerror);
        handled = true;
      }
    });
    return handled;
  },
  createContext: function (
    canvas,
    useWebGL,
    setInModule,
    webGLContextAttributes,
  ) {
    if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx;
    var ctx;
    var contextHandle;
    if (useWebGL) {
      var contextAttributes = {
        antialias: false,
        alpha: false,
        majorVersion: 1,
      };
      if (webGLContextAttributes) {
        for (var attribute in webGLContextAttributes) {
          contextAttributes[attribute] = webGLContextAttributes[attribute];
        }
      }
      if (typeof GL != "undefined") {
        contextHandle = GL.createContext(canvas, contextAttributes);
        if (contextHandle) {
          ctx = GL.getContext(contextHandle).GLctx;
        }
      }
    } else {
      ctx = canvas.getContext("2d");
    }
    if (!ctx) return null;
    if (setInModule) {
      if (!useWebGL)
        assert(
          typeof GLctx == "undefined",
          "cannot set in module if GLctx is used, but we are a non-GL context that would replace it",
        );
      Module.ctx = ctx;
      if (useWebGL) GL.makeContextCurrent(contextHandle);
      Module.useWebGL = useWebGL;
      Browser.moduleContextCreatedCallbacks.forEach(function (callback) {
        callback();
      });
      Browser.init();
    }
    return ctx;
  },
  destroyContext: function (canvas, useWebGL, setInModule) {},
  fullscreenHandlersInstalled: false,
  lockPointer: undefined,
  resizeCanvas: undefined,
  requestFullscreen: function (lockPointer, resizeCanvas) {
    Browser.lockPointer = lockPointer;
    Browser.resizeCanvas = resizeCanvas;
    if (typeof Browser.lockPointer == "undefined") Browser.lockPointer = true;
    if (typeof Browser.resizeCanvas == "undefined")
      Browser.resizeCanvas = false;
    var canvas = Module["canvas"];
    function fullscreenChange() {
      Browser.isFullscreen = false;
      var canvasContainer = canvas.parentNode;
      if (
        (document["fullscreenElement"] ||
          document["mozFullScreenElement"] ||
          document["msFullscreenElement"] ||
          document["webkitFullscreenElement"] ||
          document["webkitCurrentFullScreenElement"]) === canvasContainer
      ) {
        canvas.exitFullscreen = Browser.exitFullscreen;
        if (Browser.lockPointer) canvas.requestPointerLock();
        Browser.isFullscreen = true;
        if (Browser.resizeCanvas) {
          Browser.setFullscreenCanvasSize();
        } else {
          Browser.updateCanvasDimensions(canvas);
        }
      } else {
        canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
        canvasContainer.parentNode.removeChild(canvasContainer);
        if (Browser.resizeCanvas) {
          Browser.setWindowedCanvasSize();
        } else {
          Browser.updateCanvasDimensions(canvas);
        }
      }
      if (Module["onFullScreen"]) Module["onFullScreen"](Browser.isFullscreen);
      if (Module["onFullscreen"]) Module["onFullscreen"](Browser.isFullscreen);
    }
    if (!Browser.fullscreenHandlersInstalled) {
      Browser.fullscreenHandlersInstalled = true;
      document.addEventListener("fullscreenchange", fullscreenChange, false);
      document.addEventListener("mozfullscreenchange", fullscreenChange, false);
      document.addEventListener(
        "webkitfullscreenchange",
        fullscreenChange,
        false,
      );
      document.addEventListener("MSFullscreenChange", fullscreenChange, false);
    }
    var canvasContainer = document.createElement("div");
    canvas.parentNode.insertBefore(canvasContainer, canvas);
    canvasContainer.appendChild(canvas);
    canvasContainer.requestFullscreen =
      canvasContainer["requestFullscreen"] ||
      canvasContainer["mozRequestFullScreen"] ||
      canvasContainer["msRequestFullscreen"] ||
      (canvasContainer["webkitRequestFullscreen"]
        ? function () {
            canvasContainer["webkitRequestFullscreen"](
              Element["ALLOW_KEYBOARD_INPUT"],
            );
          }
        : null) ||
      (canvasContainer["webkitRequestFullScreen"]
        ? function () {
            canvasContainer["webkitRequestFullScreen"](
              Element["ALLOW_KEYBOARD_INPUT"],
            );
          }
        : null);
    canvasContainer.requestFullscreen();
  },
  requestFullScreen: function () {
    abort(
      "Module.requestFullScreen has been replaced by Module.requestFullscreen (without a capital S)",
    );
  },
  exitFullscreen: function () {
    if (!Browser.isFullscreen) {
      return false;
    }
    var CFS =
      document["exitFullscreen"] ||
      document["cancelFullScreen"] ||
      document["mozCancelFullScreen"] ||
      document["msExitFullscreen"] ||
      document["webkitCancelFullScreen"] ||
      function () {};
    CFS.apply(document, []);
    return true;
  },
  nextRAF: 0,
  fakeRequestAnimationFrame: function (func) {
    var now = Date.now();
    if (Browser.nextRAF === 0) {
      Browser.nextRAF = now + 1e3 / 60;
    } else {
      while (now + 2 >= Browser.nextRAF) {
        Browser.nextRAF += 1e3 / 60;
      }
    }
    var delay = Math.max(Browser.nextRAF - now, 0);
    setTimeout(func, delay);
  },
  requestAnimationFrame: function (func) {
    if (typeof requestAnimationFrame == "function") {
      requestAnimationFrame(func);
      return;
    }
    var RAF = Browser.fakeRequestAnimationFrame;
    RAF(func);
  },
  safeSetTimeout: function (func) {
    return safeSetTimeout(func);
  },
  safeRequestAnimationFrame: function (func) {
    return Browser.requestAnimationFrame(function () {
      callUserCallback(func);
    });
  },
  getMimetype: function (name) {
    return {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      bmp: "image/bmp",
      ogg: "audio/ogg",
      wav: "audio/wav",
      mp3: "audio/mpeg",
    }[name.substr(name.lastIndexOf(".") + 1)];
  },
  getUserMedia: function (func) {
    if (!window.getUserMedia) {
      window.getUserMedia =
        navigator["getUserMedia"] || navigator["mozGetUserMedia"];
    }
    window.getUserMedia(func);
  },
  getMovementX: function (event) {
    return (
      event["movementX"] ||
      event["mozMovementX"] ||
      event["webkitMovementX"] ||
      0
    );
  },
  getMovementY: function (event) {
    return (
      event["movementY"] ||
      event["mozMovementY"] ||
      event["webkitMovementY"] ||
      0
    );
  },
  getMouseWheelDelta: function (event) {
    var delta = 0;
    switch (event.type) {
      case "DOMMouseScroll":
        delta = event.detail / 3;
        break;
      case "mousewheel":
        delta = event.wheelDelta / 120;
        break;
      case "wheel":
        delta = event.deltaY;
        switch (event.deltaMode) {
          case 0:
            delta /= 100;
            break;
          case 1:
            delta /= 3;
            break;
          case 2:
            delta *= 80;
            break;
          default:
            throw "unrecognized mouse wheel delta mode: " + event.deltaMode;
        }
        break;
      default:
        throw "unrecognized mouse wheel event: " + event.type;
    }
    return delta;
  },
  mouseX: 0,
  mouseY: 0,
  mouseMovementX: 0,
  mouseMovementY: 0,
  touches: {},
  lastTouches: {},
  calculateMouseEvent: function (event) {
    if (Browser.pointerLock) {
      if (event.type != "mousemove" && "mozMovementX" in event) {
        Browser.mouseMovementX = Browser.mouseMovementY = 0;
      } else {
        Browser.mouseMovementX = Browser.getMovementX(event);
        Browser.mouseMovementY = Browser.getMovementY(event);
      }
      if (typeof SDL != "undefined") {
        Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
        Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
      } else {
        Browser.mouseX += Browser.mouseMovementX;
        Browser.mouseY += Browser.mouseMovementY;
      }
    } else {
      var rect = Module["canvas"].getBoundingClientRect();
      var cw = Module["canvas"].width;
      var ch = Module["canvas"].height;
      var scrollX =
        typeof window.scrollX != "undefined"
          ? window.scrollX
          : window.pageXOffset;
      var scrollY =
        typeof window.scrollY != "undefined"
          ? window.scrollY
          : window.pageYOffset;
      assert(
        typeof scrollX != "undefined" && typeof scrollY != "undefined",
        "Unable to retrieve scroll position, mouse positions likely broken.",
      );
      if (
        event.type === "touchstart" ||
        event.type === "touchend" ||
        event.type === "touchmove"
      ) {
        var touch = event.touch;
        if (touch === undefined) {
          return;
        }
        var adjustedX = touch.pageX - (scrollX + rect.left);
        var adjustedY = touch.pageY - (scrollY + rect.top);
        adjustedX = adjustedX * (cw / rect.width);
        adjustedY = adjustedY * (ch / rect.height);
        var coords = { x: adjustedX, y: adjustedY };
        if (event.type === "touchstart") {
          Browser.lastTouches[touch.identifier] = coords;
          Browser.touches[touch.identifier] = coords;
        } else if (event.type === "touchend" || event.type === "touchmove") {
          var last = Browser.touches[touch.identifier];
          if (!last) last = coords;
          Browser.lastTouches[touch.identifier] = last;
          Browser.touches[touch.identifier] = coords;
        }
        return;
      }
      var x = event.pageX - (scrollX + rect.left);
      var y = event.pageY - (scrollY + rect.top);
      x = x * (cw / rect.width);
      y = y * (ch / rect.height);
      Browser.mouseMovementX = x - Browser.mouseX;
      Browser.mouseMovementY = y - Browser.mouseY;
      Browser.mouseX = x;
      Browser.mouseY = y;
    }
  },
  resizeListeners: [],
  updateResizeListeners: function () {
    var canvas = Module["canvas"];
    Browser.resizeListeners.forEach(function (listener) {
      listener(canvas.width, canvas.height);
    });
  },
  setCanvasSize: function (width, height, noUpdates) {
    var canvas = Module["canvas"];
    Browser.updateCanvasDimensions(canvas, width, height);
    if (!noUpdates) Browser.updateResizeListeners();
  },
  windowedWidth: 0,
  windowedHeight: 0,
  setFullscreenCanvasSize: function () {
    if (typeof SDL != "undefined") {
      var flags = HEAPU32[SDL.screen >> 2];
      flags = flags | 8388608;
      HEAP32[SDL.screen >> 2] = flags;
    }
    Browser.updateCanvasDimensions(Module["canvas"]);
    Browser.updateResizeListeners();
  },
  setWindowedCanvasSize: function () {
    if (typeof SDL != "undefined") {
      var flags = HEAPU32[SDL.screen >> 2];
      flags = flags & ~8388608;
      HEAP32[SDL.screen >> 2] = flags;
    }
    Browser.updateCanvasDimensions(Module["canvas"]);
    Browser.updateResizeListeners();
  },
  updateCanvasDimensions: function (canvas, wNative, hNative) {
    if (wNative && hNative) {
      canvas.widthNative = wNative;
      canvas.heightNative = hNative;
    } else {
      wNative = canvas.widthNative;
      hNative = canvas.heightNative;
    }
    var w = wNative;
    var h = hNative;
    if (Module["forcedAspectRatio"] && Module["forcedAspectRatio"] > 0) {
      if (w / h < Module["forcedAspectRatio"]) {
        w = Math.round(h * Module["forcedAspectRatio"]);
      } else {
        h = Math.round(w / Module["forcedAspectRatio"]);
      }
    }
    if (
      (document["fullscreenElement"] ||
        document["mozFullScreenElement"] ||
        document["msFullscreenElement"] ||
        document["webkitFullscreenElement"] ||
        document["webkitCurrentFullScreenElement"]) === canvas.parentNode &&
      typeof screen != "undefined"
    ) {
      var factor = Math.min(screen.width / w, screen.height / h);
      w = Math.round(w * factor);
      h = Math.round(h * factor);
    }
    if (Browser.resizeCanvas) {
      if (canvas.width != w) canvas.width = w;
      if (canvas.height != h) canvas.height = h;
      if (typeof canvas.style != "undefined") {
        canvas.style.removeProperty("width");
        canvas.style.removeProperty("height");
      }
    } else {
      if (canvas.width != wNative) canvas.width = wNative;
      if (canvas.height != hNative) canvas.height = hNative;
      if (typeof canvas.style != "undefined") {
        if (w != wNative || h != hNative) {
          canvas.style.setProperty("width", w + "px", "important");
          canvas.style.setProperty("height", h + "px", "important");
        } else {
          canvas.style.removeProperty("width");
          canvas.style.removeProperty("height");
        }
      }
    }
  },
};
function _emscripten_force_exit(status) {
  warnOnce(
    "emscripten_force_exit cannot actually shut down the runtime, as the build does not have EXIT_RUNTIME set",
  );
  noExitRuntime = false;
  runtimeKeepaliveCounter = 0;
  exit(status);
}
function _emscripten_memcpy_big(dest, src, num) {
  HEAPU8.copyWithin(dest, src, src + num);
}
function _emscripten_get_heap_max() {
  return 2147483648;
}
function emscripten_realloc_buffer(size) {
  try {
    wasmMemory.grow((size - buffer.byteLength + 65535) >>> 16);
    updateGlobalBufferAndViews(wasmMemory.buffer);
    return 1;
  } catch (e) {
    err(
      "emscripten_realloc_buffer: Attempted to grow heap from " +
        buffer.byteLength +
        " bytes to " +
        size +
        " bytes, but got error: " +
        e,
    );
  }
}
function _emscripten_resize_heap(requestedSize) {
  var oldSize = HEAPU8.length;
  requestedSize = requestedSize >>> 0;
  assert(requestedSize > oldSize);
  var maxHeapSize = _emscripten_get_heap_max();
  if (requestedSize > maxHeapSize) {
    err(
      "Cannot enlarge memory, asked to go up to " +
        requestedSize +
        " bytes, but the limit is " +
        maxHeapSize +
        " bytes!",
    );
    return false;
  }
  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
    var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
    var newSize = Math.min(
      maxHeapSize,
      alignUp(Math.max(requestedSize, overGrownHeapSize), 65536),
    );
    var replacement = emscripten_realloc_buffer(newSize);
    if (replacement) {
      return true;
    }
  }
  err(
    "Failed to grow the heap from " +
      oldSize +
      " bytes to " +
      newSize +
      " bytes, not enough memory!",
  );
  return false;
}
function _emscripten_run_script_int(ptr) {
  return eval(UTF8ToString(ptr)) | 0;
}
function _emscripten_sleep(ms) {
  Asyncify.handleSleep((wakeUp) => safeSetTimeout(wakeUp, ms));
}
function _fd_close(fd) {
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    FS.close(stream);
    return 0;
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return e.errno;
  }
}
function _fd_read(fd, iov, iovcnt, pnum) {
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    var num = SYSCALLS.doReadv(stream, iov, iovcnt);
    HEAP32[pnum >> 2] = num;
    return 0;
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return e.errno;
  }
}
function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    var HIGH_OFFSET = 4294967296;
    var offset = offset_high * HIGH_OFFSET + (offset_low >>> 0);
    var DOUBLE_LIMIT = 9007199254740992;
    if (offset <= -DOUBLE_LIMIT || offset >= DOUBLE_LIMIT) {
      return -61;
    }
    FS.llseek(stream, offset, whence);
    (tempI64 = [
      stream.position >>> 0,
      ((tempDouble = stream.position),
      +Math.abs(tempDouble) >= 1
        ? tempDouble > 0
          ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>>
            0
          : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>>
            0
        : 0),
    ]),
      (HEAP32[newOffset >> 2] = tempI64[0]),
      (HEAP32[(newOffset + 4) >> 2] = tempI64[1]);
    if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
    return 0;
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return e.errno;
  }
}
function _fd_write(fd, iov, iovcnt, pnum) {
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    var num = SYSCALLS.doWritev(stream, iov, iovcnt);
    HEAP32[pnum >> 2] = num;
    return 0;
  } catch (e) {
    if (typeof FS == "undefined" || !(e instanceof FS.ErrnoError)) throw e;
    return e.errno;
  }
}
function _gettimeofday(ptr) {
  var now = Date.now();
  HEAP32[ptr >> 2] = (now / 1e3) | 0;
  HEAP32[(ptr + 4) >> 2] = ((now % 1e3) * 1e3) | 0;
  return 0;
}
function _setTempRet0(val) {
  setTempRet0(val);
}
function runAndAbortIfError(func) {
  try {
    return func();
  } catch (e) {
    abort(e);
  }
}
var Asyncify = {
  State: { Normal: 0, Unwinding: 1, Rewinding: 2, Disabled: 3 },
  state: 0,
  StackSize: 4096,
  currData: null,
  handleSleepReturnValue: 0,
  exportCallStack: [],
  callStackNameToId: {},
  callStackIdToName: {},
  callStackId: 0,
  asyncPromiseHandlers: null,
  sleepCallbacks: [],
  getCallStackId: function (funcName) {
    var id = Asyncify.callStackNameToId[funcName];
    if (id === undefined) {
      id = Asyncify.callStackId++;
      Asyncify.callStackNameToId[funcName] = id;
      Asyncify.callStackIdToName[id] = funcName;
    }
    return id;
  },
  instrumentWasmImports: function (imports) {
    var ASYNCIFY_IMPORTS = [
      "env.invoke_*",
      "env.emscripten_sleep",
      "env.emscripten_wget",
      "env.emscripten_wget_data",
      "env.emscripten_idb_load",
      "env.emscripten_idb_store",
      "env.emscripten_idb_delete",
      "env.emscripten_idb_exists",
      "env.emscripten_idb_load_blob",
      "env.emscripten_idb_store_blob",
      "env.SDL_Delay",
      "env.emscripten_scan_registers",
      "env.emscripten_lazy_load_code",
      "env.emscripten_fiber_swap",
      "wasi_snapshot_preview1.fd_sync",
      "env.__wasi_fd_sync",
      "env._emval_await",
      "env._dlopen_js",
      "env.__asyncjs__*",
    ].map((x) => x.split(".")[1]);
    for (var x in imports) {
      (function (x) {
        var original = imports[x];
        if (typeof original == "function") {
          imports[x] = function () {
            var originalAsyncifyState = Asyncify.state;
            try {
              return original.apply(null, arguments);
            } finally {
              var isAsyncifyImport =
                ASYNCIFY_IMPORTS.indexOf(x) >= 0 || x.startsWith("__asyncjs__");
              var changedToDisabled =
                originalAsyncifyState === Asyncify.State.Normal &&
                Asyncify.state === Asyncify.State.Disabled;
              var ignoredInvoke = x.startsWith("invoke_") && true;
              if (
                Asyncify.state !== originalAsyncifyState &&
                !isAsyncifyImport &&
                !changedToDisabled &&
                !ignoredInvoke
              ) {
                throw new Error(
                  "import " +
                    x +
                    " was not in ASYNCIFY_IMPORTS, but changed the state",
                );
              }
            }
          };
        }
      })(x);
    }
  },
  instrumentWasmExports: function (exports) {
    var ret = {};
    for (var x in exports) {
      (function (x) {
        var original = exports[x];
        if (typeof original == "function") {
          ret[x] = function () {
            Asyncify.exportCallStack.push(x);
            try {
              return original.apply(null, arguments);
            } finally {
              if (!ABORT) {
                var y = Asyncify.exportCallStack.pop();
                assert(y === x);
                Asyncify.maybeStopUnwind();
              }
            }
          };
        } else {
          ret[x] = original;
        }
      })(x);
    }
    return ret;
  },
  maybeStopUnwind: function () {
    if (
      Asyncify.currData &&
      Asyncify.state === Asyncify.State.Unwinding &&
      Asyncify.exportCallStack.length === 0
    ) {
      Asyncify.state = Asyncify.State.Normal;
      runAndAbortIfError(Module["_asyncify_stop_unwind"]);
      if (typeof Fibers != "undefined") {
        Fibers.trampoline();
      }
    }
  },
  whenDone: function () {
    assert(
      Asyncify.currData,
      "Tried to wait for an async operation when none is in progress.",
    );
    assert(
      !Asyncify.asyncPromiseHandlers,
      "Cannot have multiple async operations in flight at once",
    );
    return new Promise((resolve, reject) => {
      Asyncify.asyncPromiseHandlers = { resolve: resolve, reject: reject };
    });
  },
  allocateData: function () {
    var ptr = _malloc(12 + Asyncify.StackSize);
    Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize);
    Asyncify.setDataRewindFunc(ptr);
    return ptr;
  },
  setDataHeader: function (ptr, stack, stackSize) {
    HEAP32[ptr >> 2] = stack;
    HEAP32[(ptr + 4) >> 2] = stack + stackSize;
  },
  setDataRewindFunc: function (ptr) {
    var bottomOfCallStack = Asyncify.exportCallStack[0];
    var rewindId = Asyncify.getCallStackId(bottomOfCallStack);
    HEAP32[(ptr + 8) >> 2] = rewindId;
  },
  getDataRewindFunc: function (ptr) {
    var id = HEAP32[(ptr + 8) >> 2];
    var name = Asyncify.callStackIdToName[id];
    var func = Module["asm"][name];
    return func;
  },
  doRewind: function (ptr) {
    var start = Asyncify.getDataRewindFunc(ptr);
    return start();
  },
  handleSleep: function (startAsync) {
    assert(
      Asyncify.state !== Asyncify.State.Disabled,
      "Asyncify cannot be done during or after the runtime exits",
    );
    if (ABORT) return;
    if (Asyncify.state === Asyncify.State.Normal) {
      var reachedCallback = false;
      var reachedAfterCallback = false;
      startAsync((handleSleepReturnValue) => {
        assert(
          !handleSleepReturnValue ||
            typeof handleSleepReturnValue == "number" ||
            typeof handleSleepReturnValue == "boolean",
        );
        if (ABORT) return;
        Asyncify.handleSleepReturnValue = handleSleepReturnValue || 0;
        reachedCallback = true;
        if (!reachedAfterCallback) {
          return;
        }
        assert(
          !Asyncify.exportCallStack.length,
          "Waking up (starting to rewind) must be done from JS, without compiled code on the stack.",
        );
        Asyncify.state = Asyncify.State.Rewinding;
        runAndAbortIfError(() =>
          Module["_asyncify_start_rewind"](Asyncify.currData),
        );
        if (typeof Browser != "undefined" && Browser.mainLoop.func) {
          Browser.mainLoop.resume();
        }
        var asyncWasmReturnValue,
          isError = false;
        try {
          asyncWasmReturnValue = Asyncify.doRewind(Asyncify.currData);
        } catch (err) {
          asyncWasmReturnValue = err;
          isError = true;
        }
        var handled = false;
        if (!Asyncify.currData) {
          var asyncPromiseHandlers = Asyncify.asyncPromiseHandlers;
          if (asyncPromiseHandlers) {
            Asyncify.asyncPromiseHandlers = null;
            (isError
              ? asyncPromiseHandlers.reject
              : asyncPromiseHandlers.resolve)(asyncWasmReturnValue);
            handled = true;
          }
        }
        if (isError && !handled) {
          throw asyncWasmReturnValue;
        }
      });
      reachedAfterCallback = true;
      if (!reachedCallback) {
        Asyncify.state = Asyncify.State.Unwinding;
        Asyncify.currData = Asyncify.allocateData();
        runAndAbortIfError(() =>
          Module["_asyncify_start_unwind"](Asyncify.currData),
        );
        if (typeof Browser != "undefined" && Browser.mainLoop.func) {
          Browser.mainLoop.pause();
        }
      }
    } else if (Asyncify.state === Asyncify.State.Rewinding) {
      Asyncify.state = Asyncify.State.Normal;
      runAndAbortIfError(Module["_asyncify_stop_rewind"]);
      _free(Asyncify.currData);
      Asyncify.currData = null;
      Asyncify.sleepCallbacks.forEach((func) => callUserCallback(func));
    } else {
      abort("invalid state: " + Asyncify.state);
    }
    return Asyncify.handleSleepReturnValue;
  },
  handleAsync: function (startAsync) {
    return Asyncify.handleSleep((wakeUp) => {
      startAsync().then(wakeUp);
    });
  },
};
var FSNode = function (parent, name, mode, rdev) {
  if (!parent) {
    parent = this;
  }
  this.parent = parent;
  this.mount = parent.mount;
  this.mounted = null;
  this.id = FS.nextInode++;
  this.name = name;
  this.mode = mode;
  this.node_ops = {};
  this.stream_ops = {};
  this.rdev = rdev;
};
var readMode = 292 | 73;
var writeMode = 146;
Object.defineProperties(FSNode.prototype, {
  read: {
    get: function () {
      return (this.mode & readMode) === readMode;
    },
    set: function (val) {
      val ? (this.mode |= readMode) : (this.mode &= ~readMode);
    },
  },
  write: {
    get: function () {
      return (this.mode & writeMode) === writeMode;
    },
    set: function (val) {
      val ? (this.mode |= writeMode) : (this.mode &= ~writeMode);
    },
  },
  isFolder: {
    get: function () {
      return FS.isDir(this.mode);
    },
  },
  isDevice: {
    get: function () {
      return FS.isChrdev(this.mode);
    },
  },
});
FS.FSNode = FSNode;
FS.staticInit();
ERRNO_CODES = {
  EPERM: 63,
  ENOENT: 44,
  ESRCH: 71,
  EINTR: 27,
  EIO: 29,
  ENXIO: 60,
  E2BIG: 1,
  ENOEXEC: 45,
  EBADF: 8,
  ECHILD: 12,
  EAGAIN: 6,
  EWOULDBLOCK: 6,
  ENOMEM: 48,
  EACCES: 2,
  EFAULT: 21,
  ENOTBLK: 105,
  EBUSY: 10,
  EEXIST: 20,
  EXDEV: 75,
  ENODEV: 43,
  ENOTDIR: 54,
  EISDIR: 31,
  EINVAL: 28,
  ENFILE: 41,
  EMFILE: 33,
  ENOTTY: 59,
  ETXTBSY: 74,
  EFBIG: 22,
  ENOSPC: 51,
  ESPIPE: 70,
  EROFS: 69,
  EMLINK: 34,
  EPIPE: 64,
  EDOM: 18,
  ERANGE: 68,
  ENOMSG: 49,
  EIDRM: 24,
  ECHRNG: 106,
  EL2NSYNC: 156,
  EL3HLT: 107,
  EL3RST: 108,
  ELNRNG: 109,
  EUNATCH: 110,
  ENOCSI: 111,
  EL2HLT: 112,
  EDEADLK: 16,
  ENOLCK: 46,
  EBADE: 113,
  EBADR: 114,
  EXFULL: 115,
  ENOANO: 104,
  EBADRQC: 103,
  EBADSLT: 102,
  EDEADLOCK: 16,
  EBFONT: 101,
  ENOSTR: 100,
  ENODATA: 116,
  ETIME: 117,
  ENOSR: 118,
  ENONET: 119,
  ENOPKG: 120,
  EREMOTE: 121,
  ENOLINK: 47,
  EADV: 122,
  ESRMNT: 123,
  ECOMM: 124,
  EPROTO: 65,
  EMULTIHOP: 36,
  EDOTDOT: 125,
  EBADMSG: 9,
  ENOTUNIQ: 126,
  EBADFD: 127,
  EREMCHG: 128,
  ELIBACC: 129,
  ELIBBAD: 130,
  ELIBSCN: 131,
  ELIBMAX: 132,
  ELIBEXEC: 133,
  ENOSYS: 52,
  ENOTEMPTY: 55,
  ENAMETOOLONG: 37,
  ELOOP: 32,
  EOPNOTSUPP: 138,
  EPFNOSUPPORT: 139,
  ECONNRESET: 15,
  ENOBUFS: 42,
  EAFNOSUPPORT: 5,
  EPROTOTYPE: 67,
  ENOTSOCK: 57,
  ENOPROTOOPT: 50,
  ESHUTDOWN: 140,
  ECONNREFUSED: 14,
  EADDRINUSE: 3,
  ECONNABORTED: 13,
  ENETUNREACH: 40,
  ENETDOWN: 38,
  ETIMEDOUT: 73,
  EHOSTDOWN: 142,
  EHOSTUNREACH: 23,
  EINPROGRESS: 26,
  EALREADY: 7,
  EDESTADDRREQ: 17,
  EMSGSIZE: 35,
  EPROTONOSUPPORT: 66,
  ESOCKTNOSUPPORT: 137,
  EADDRNOTAVAIL: 4,
  ENETRESET: 39,
  EISCONN: 30,
  ENOTCONN: 53,
  ETOOMANYREFS: 141,
  EUSERS: 136,
  EDQUOT: 19,
  ESTALE: 72,
  ENOTSUP: 138,
  ENOMEDIUM: 148,
  EILSEQ: 25,
  EOVERFLOW: 61,
  ECANCELED: 11,
  ENOTRECOVERABLE: 56,
  EOWNERDEAD: 62,
  ESTRPIPE: 135,
};
Module["requestFullscreen"] = function Module_requestFullscreen(
  lockPointer,
  resizeCanvas,
) {
  Browser.requestFullscreen(lockPointer, resizeCanvas);
};
Module["requestFullScreen"] = function Module_requestFullScreen() {
  Browser.requestFullScreen();
};
Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) {
  Browser.requestAnimationFrame(func);
};
Module["setCanvasSize"] = function Module_setCanvasSize(
  width,
  height,
  noUpdates,
) {
  Browser.setCanvasSize(width, height, noUpdates);
};
Module["pauseMainLoop"] = function Module_pauseMainLoop() {
  Browser.mainLoop.pause();
};
Module["resumeMainLoop"] = function Module_resumeMainLoop() {
  Browser.mainLoop.resume();
};
Module["getUserMedia"] = function Module_getUserMedia() {
  Browser.getUserMedia();
};
Module["createContext"] = function Module_createContext(
  canvas,
  useWebGL,
  setInModule,
  webGLContextAttributes,
) {
  return Browser.createContext(
    canvas,
    useWebGL,
    setInModule,
    webGLContextAttributes,
  );
};
var ASSERTIONS = true;
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
var asmLibraryArg = {
  __assert_fail: ___assert_fail,
  __syscall_fcntl64: ___syscall_fcntl64,
  __syscall_fstat64: ___syscall_fstat64,
  __syscall_ioctl: ___syscall_ioctl,
  __syscall_open: ___syscall_open,
  _mmap_js: __mmap_js,
  _munmap_js: __munmap_js,
  abort: _abort,
  emscripten_force_exit: _emscripten_force_exit,
  emscripten_memcpy_big: _emscripten_memcpy_big,
  emscripten_resize_heap: _emscripten_resize_heap,
  emscripten_run_script_int: _emscripten_run_script_int,
  emscripten_sleep: _emscripten_sleep,
  exit: _exit,
  fd_close: _fd_close,
  fd_read: _fd_read,
  fd_seek: _fd_seek,
  fd_write: _fd_write,
  gettimeofday: _gettimeofday,
  setTempRet0: _setTempRet0,
};
Asyncify.instrumentWasmImports(asmLibraryArg);
var asm = createWasm();
var ___wasm_call_ctors = (Module["___wasm_call_ctors"] =
  createExportWrapper("__wasm_call_ctors"));
var _malloc = (Module["_malloc"] = createExportWrapper("malloc"));
var _free = (Module["_free"] = createExportWrapper("free"));
var _send_int_to_C = (Module["_send_int_to_C"] =
  createExportWrapper("send_int_to_C"));
var _send_float_to_C = (Module["_send_float_to_C"] =
  createExportWrapper("send_float_to_C"));
var _send_double_to_C = (Module["_send_double_to_C"] =
  createExportWrapper("send_double_to_C"));
var _send_char_to_C = (Module["_send_char_to_C"] =
  createExportWrapper("send_char_to_C"));
var _send_string_to_C = (Module["_send_string_to_C"] =
  createExportWrapper("send_string_to_C"));
var _reanudar_ejecucion = (Module["_reanudar_ejecucion"] =
  createExportWrapper("reanudar_ejecucion"));
var ___errno_location = (Module["___errno_location"] =
  createExportWrapper("__errno_location"));
var _main = (Module["_main"] = createExportWrapper("main"));
var ___stdio_exit = (Module["___stdio_exit"] =
  createExportWrapper("__stdio_exit"));
var _emscripten_builtin_memalign = (Module["_emscripten_builtin_memalign"] =
  createExportWrapper("emscripten_builtin_memalign"));
var _emscripten_stack_init = (Module["_emscripten_stack_init"] = function () {
  return (_emscripten_stack_init = Module["_emscripten_stack_init"] =
    Module["asm"]["emscripten_stack_init"]).apply(null, arguments);
});
var _emscripten_stack_set_limits = (Module["_emscripten_stack_set_limits"] =
  function () {
    return (_emscripten_stack_set_limits = Module[
      "_emscripten_stack_set_limits"
    ] =
      Module["asm"]["emscripten_stack_set_limits"]).apply(null, arguments);
  });
var _emscripten_stack_get_free = (Module["_emscripten_stack_get_free"] =
  function () {
    return (_emscripten_stack_get_free = Module["_emscripten_stack_get_free"] =
      Module["asm"]["emscripten_stack_get_free"]).apply(null, arguments);
  });
var _emscripten_stack_get_base = (Module["_emscripten_stack_get_base"] =
  function () {
    return (_emscripten_stack_get_base = Module["_emscripten_stack_get_base"] =
      Module["asm"]["emscripten_stack_get_base"]).apply(null, arguments);
  });
var _emscripten_stack_get_end = (Module["_emscripten_stack_get_end"] =
  function () {
    return (_emscripten_stack_get_end = Module["_emscripten_stack_get_end"] =
      Module["asm"]["emscripten_stack_get_end"]).apply(null, arguments);
  });
var stackSave = (Module["stackSave"] = createExportWrapper("stackSave"));
var stackRestore = (Module["stackRestore"] =
  createExportWrapper("stackRestore"));
var stackAlloc = (Module["stackAlloc"] = createExportWrapper("stackAlloc"));
var dynCall_ii = (Module["dynCall_ii"] = createExportWrapper("dynCall_ii"));
var dynCall_iiii = (Module["dynCall_iiii"] =
  createExportWrapper("dynCall_iiii"));
var dynCall_vii = (Module["dynCall_vii"] = createExportWrapper("dynCall_vii"));
var dynCall_jiji = (Module["dynCall_jiji"] =
  createExportWrapper("dynCall_jiji"));
var dynCall_iidiiii = (Module["dynCall_iidiiii"] =
  createExportWrapper("dynCall_iidiiii"));
var _asyncify_start_unwind = (Module["_asyncify_start_unwind"] =
  createExportWrapper("asyncify_start_unwind"));
var _asyncify_stop_unwind = (Module["_asyncify_stop_unwind"] =
  createExportWrapper("asyncify_stop_unwind"));
var _asyncify_start_rewind = (Module["_asyncify_start_rewind"] =
  createExportWrapper("asyncify_start_rewind"));
var _asyncify_stop_rewind = (Module["_asyncify_stop_rewind"] =
  createExportWrapper("asyncify_stop_rewind"));
if (!Object.getOwnPropertyDescriptor(Module, "intArrayFromString"))
  Module["intArrayFromString"] = () =>
    abort(
      "'intArrayFromString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "intArrayToString"))
  Module["intArrayToString"] = () =>
    abort(
      "'intArrayToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
Module["ccall"] = ccall;
if (!Object.getOwnPropertyDescriptor(Module, "cwrap"))
  Module["cwrap"] = () =>
    abort(
      "'cwrap' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "setValue"))
  Module["setValue"] = () =>
    abort(
      "'setValue' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getValue"))
  Module["getValue"] = () =>
    abort(
      "'getValue' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "allocate"))
  Module["allocate"] = () =>
    abort(
      "'allocate' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "UTF8ArrayToString"))
  Module["UTF8ArrayToString"] = () =>
    abort(
      "'UTF8ArrayToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "UTF8ToString"))
  Module["UTF8ToString"] = () =>
    abort(
      "'UTF8ToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF8Array"))
  Module["stringToUTF8Array"] = () =>
    abort(
      "'stringToUTF8Array' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF8"))
  Module["stringToUTF8"] = () =>
    abort(
      "'stringToUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF8"))
  Module["lengthBytesUTF8"] = () =>
    abort(
      "'lengthBytesUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stackTrace"))
  Module["stackTrace"] = () =>
    abort(
      "'stackTrace' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "addOnPreRun"))
  Module["addOnPreRun"] = () =>
    abort(
      "'addOnPreRun' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "addOnInit"))
  Module["addOnInit"] = () =>
    abort(
      "'addOnInit' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "addOnPreMain"))
  Module["addOnPreMain"] = () =>
    abort(
      "'addOnPreMain' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "addOnExit"))
  Module["addOnExit"] = () =>
    abort(
      "'addOnExit' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "addOnPostRun"))
  Module["addOnPostRun"] = () =>
    abort(
      "'addOnPostRun' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeStringToMemory"))
  Module["writeStringToMemory"] = () =>
    abort(
      "'writeStringToMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeArrayToMemory"))
  Module["writeArrayToMemory"] = () =>
    abort(
      "'writeArrayToMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeAsciiToMemory"))
  Module["writeAsciiToMemory"] = () =>
    abort(
      "'writeAsciiToMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "addRunDependency"))
  Module["addRunDependency"] = () =>
    abort(
      "'addRunDependency' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you",
    );
if (!Object.getOwnPropertyDescriptor(Module, "removeRunDependency"))
  Module["removeRunDependency"] = () =>
    abort(
      "'removeRunDependency' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you",
    );
if (!Object.getOwnPropertyDescriptor(Module, "FS_createFolder"))
  Module["FS_createFolder"] = () =>
    abort(
      "'FS_createFolder' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "FS_createPath"))
  Module["FS_createPath"] = () =>
    abort(
      "'FS_createPath' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you",
    );
if (!Object.getOwnPropertyDescriptor(Module, "FS_createDataFile"))
  Module["FS_createDataFile"] = () =>
    abort(
      "'FS_createDataFile' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you",
    );
if (!Object.getOwnPropertyDescriptor(Module, "FS_createPreloadedFile"))
  Module["FS_createPreloadedFile"] = () =>
    abort(
      "'FS_createPreloadedFile' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you",
    );
if (!Object.getOwnPropertyDescriptor(Module, "FS_createLazyFile"))
  Module["FS_createLazyFile"] = () =>
    abort(
      "'FS_createLazyFile' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you",
    );
if (!Object.getOwnPropertyDescriptor(Module, "FS_createLink"))
  Module["FS_createLink"] = () =>
    abort(
      "'FS_createLink' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "FS_createDevice"))
  Module["FS_createDevice"] = () =>
    abort(
      "'FS_createDevice' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you",
    );
if (!Object.getOwnPropertyDescriptor(Module, "FS_unlink"))
  Module["FS_unlink"] = () =>
    abort(
      "'FS_unlink' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getLEB"))
  Module["getLEB"] = () =>
    abort(
      "'getLEB' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getFunctionTables"))
  Module["getFunctionTables"] = () =>
    abort(
      "'getFunctionTables' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "alignFunctionTables"))
  Module["alignFunctionTables"] = () =>
    abort(
      "'alignFunctionTables' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerFunctions"))
  Module["registerFunctions"] = () =>
    abort(
      "'registerFunctions' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "addFunction"))
  Module["addFunction"] = () =>
    abort(
      "'addFunction' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "removeFunction"))
  Module["removeFunction"] = () =>
    abort(
      "'removeFunction' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getFuncWrapper"))
  Module["getFuncWrapper"] = () =>
    abort(
      "'getFuncWrapper' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "prettyPrint"))
  Module["prettyPrint"] = () =>
    abort(
      "'prettyPrint' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "dynCall"))
  Module["dynCall"] = () =>
    abort(
      "'dynCall' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getCompilerSetting"))
  Module["getCompilerSetting"] = () =>
    abort(
      "'getCompilerSetting' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "print"))
  Module["print"] = () =>
    abort(
      "'print' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "printErr"))
  Module["printErr"] = () =>
    abort(
      "'printErr' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getTempRet0"))
  Module["getTempRet0"] = () =>
    abort(
      "'getTempRet0' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "setTempRet0"))
  Module["setTempRet0"] = () =>
    abort(
      "'setTempRet0' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
Module["callMain"] = callMain;
if (!Object.getOwnPropertyDescriptor(Module, "abort"))
  Module["abort"] = () =>
    abort(
      "'abort' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "keepRuntimeAlive"))
  Module["keepRuntimeAlive"] = () =>
    abort(
      "'keepRuntimeAlive' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "zeroMemory"))
  Module["zeroMemory"] = () =>
    abort(
      "'zeroMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stringToNewUTF8"))
  Module["stringToNewUTF8"] = () =>
    abort(
      "'stringToNewUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "emscripten_realloc_buffer"))
  Module["emscripten_realloc_buffer"] = () =>
    abort(
      "'emscripten_realloc_buffer' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "ENV"))
  Module["ENV"] = () =>
    abort(
      "'ENV' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "withStackSave"))
  Module["withStackSave"] = () =>
    abort(
      "'withStackSave' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "ERRNO_CODES"))
  Module["ERRNO_CODES"] = () =>
    abort(
      "'ERRNO_CODES' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "ERRNO_MESSAGES"))
  Module["ERRNO_MESSAGES"] = () =>
    abort(
      "'ERRNO_MESSAGES' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "setErrNo"))
  Module["setErrNo"] = () =>
    abort(
      "'setErrNo' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "inetPton4"))
  Module["inetPton4"] = () =>
    abort(
      "'inetPton4' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "inetNtop4"))
  Module["inetNtop4"] = () =>
    abort(
      "'inetNtop4' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "inetPton6"))
  Module["inetPton6"] = () =>
    abort(
      "'inetPton6' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "inetNtop6"))
  Module["inetNtop6"] = () =>
    abort(
      "'inetNtop6' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "readSockaddr"))
  Module["readSockaddr"] = () =>
    abort(
      "'readSockaddr' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeSockaddr"))
  Module["writeSockaddr"] = () =>
    abort(
      "'writeSockaddr' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "DNS"))
  Module["DNS"] = () =>
    abort(
      "'DNS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getHostByName"))
  Module["getHostByName"] = () =>
    abort(
      "'getHostByName' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "Protocols"))
  Module["Protocols"] = () =>
    abort(
      "'Protocols' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "Sockets"))
  Module["Sockets"] = () =>
    abort(
      "'Sockets' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getRandomDevice"))
  Module["getRandomDevice"] = () =>
    abort(
      "'getRandomDevice' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "traverseStack"))
  Module["traverseStack"] = () =>
    abort(
      "'traverseStack' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "convertFrameToPC"))
  Module["convertFrameToPC"] = () =>
    abort(
      "'convertFrameToPC' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "UNWIND_CACHE"))
  Module["UNWIND_CACHE"] = () =>
    abort(
      "'UNWIND_CACHE' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "saveInUnwindCache"))
  Module["saveInUnwindCache"] = () =>
    abort(
      "'saveInUnwindCache' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "convertPCtoSourceLocation"))
  Module["convertPCtoSourceLocation"] = () =>
    abort(
      "'convertPCtoSourceLocation' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "readAsmConstArgsArray"))
  Module["readAsmConstArgsArray"] = () =>
    abort(
      "'readAsmConstArgsArray' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "readAsmConstArgs"))
  Module["readAsmConstArgs"] = () =>
    abort(
      "'readAsmConstArgs' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "mainThreadEM_ASM"))
  Module["mainThreadEM_ASM"] = () =>
    abort(
      "'mainThreadEM_ASM' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "jstoi_q"))
  Module["jstoi_q"] = () =>
    abort(
      "'jstoi_q' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "jstoi_s"))
  Module["jstoi_s"] = () =>
    abort(
      "'jstoi_s' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getExecutableName"))
  Module["getExecutableName"] = () =>
    abort(
      "'getExecutableName' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "listenOnce"))
  Module["listenOnce"] = () =>
    abort(
      "'listenOnce' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "autoResumeAudioContext"))
  Module["autoResumeAudioContext"] = () =>
    abort(
      "'autoResumeAudioContext' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "dynCallLegacy"))
  Module["dynCallLegacy"] = () =>
    abort(
      "'dynCallLegacy' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getDynCaller"))
  Module["getDynCaller"] = () =>
    abort(
      "'getDynCaller' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "dynCall"))
  Module["dynCall"] = () =>
    abort(
      "'dynCall' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "callRuntimeCallbacks"))
  Module["callRuntimeCallbacks"] = () =>
    abort(
      "'callRuntimeCallbacks' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "wasmTableMirror"))
  Module["wasmTableMirror"] = () =>
    abort(
      "'wasmTableMirror' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "setWasmTableEntry"))
  Module["setWasmTableEntry"] = () =>
    abort(
      "'setWasmTableEntry' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getWasmTableEntry"))
  Module["getWasmTableEntry"] = () =>
    abort(
      "'getWasmTableEntry' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "handleException"))
  Module["handleException"] = () =>
    abort(
      "'handleException' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "runtimeKeepalivePush"))
  Module["runtimeKeepalivePush"] = () =>
    abort(
      "'runtimeKeepalivePush' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "runtimeKeepalivePop"))
  Module["runtimeKeepalivePop"] = () =>
    abort(
      "'runtimeKeepalivePop' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "callUserCallback"))
  Module["callUserCallback"] = () =>
    abort(
      "'callUserCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "maybeExit"))
  Module["maybeExit"] = () =>
    abort(
      "'maybeExit' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "safeSetTimeout"))
  Module["safeSetTimeout"] = () =>
    abort(
      "'safeSetTimeout' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "asmjsMangle"))
  Module["asmjsMangle"] = () =>
    abort(
      "'asmjsMangle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "asyncLoad"))
  Module["asyncLoad"] = () =>
    abort(
      "'asyncLoad' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "alignMemory"))
  Module["alignMemory"] = () =>
    abort(
      "'alignMemory' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "mmapAlloc"))
  Module["mmapAlloc"] = () =>
    abort(
      "'mmapAlloc' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "reallyNegative"))
  Module["reallyNegative"] = () =>
    abort(
      "'reallyNegative' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "unSign"))
  Module["unSign"] = () =>
    abort(
      "'unSign' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "reSign"))
  Module["reSign"] = () =>
    abort(
      "'reSign' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "formatString"))
  Module["formatString"] = () =>
    abort(
      "'formatString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "PATH"))
  Module["PATH"] = () =>
    abort(
      "'PATH' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "PATH_FS"))
  Module["PATH_FS"] = () =>
    abort(
      "'PATH_FS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "SYSCALLS"))
  Module["SYSCALLS"] = () =>
    abort(
      "'SYSCALLS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getSocketFromFD"))
  Module["getSocketFromFD"] = () =>
    abort(
      "'getSocketFromFD' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getSocketAddress"))
  Module["getSocketAddress"] = () =>
    abort(
      "'getSocketAddress' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "JSEvents"))
  Module["JSEvents"] = () =>
    abort(
      "'JSEvents' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerKeyEventCallback"))
  Module["registerKeyEventCallback"] = () =>
    abort(
      "'registerKeyEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "specialHTMLTargets"))
  Module["specialHTMLTargets"] = () =>
    abort(
      "'specialHTMLTargets' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "maybeCStringToJsString"))
  Module["maybeCStringToJsString"] = () =>
    abort(
      "'maybeCStringToJsString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "findEventTarget"))
  Module["findEventTarget"] = () =>
    abort(
      "'findEventTarget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "findCanvasEventTarget"))
  Module["findCanvasEventTarget"] = () =>
    abort(
      "'findCanvasEventTarget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getBoundingClientRect"))
  Module["getBoundingClientRect"] = () =>
    abort(
      "'getBoundingClientRect' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "fillMouseEventData"))
  Module["fillMouseEventData"] = () =>
    abort(
      "'fillMouseEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerMouseEventCallback"))
  Module["registerMouseEventCallback"] = () =>
    abort(
      "'registerMouseEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerWheelEventCallback"))
  Module["registerWheelEventCallback"] = () =>
    abort(
      "'registerWheelEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerUiEventCallback"))
  Module["registerUiEventCallback"] = () =>
    abort(
      "'registerUiEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerFocusEventCallback"))
  Module["registerFocusEventCallback"] = () =>
    abort(
      "'registerFocusEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "fillDeviceOrientationEventData"))
  Module["fillDeviceOrientationEventData"] = () =>
    abort(
      "'fillDeviceOrientationEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(
    Module,
    "registerDeviceOrientationEventCallback",
  )
)
  Module["registerDeviceOrientationEventCallback"] = () =>
    abort(
      "'registerDeviceOrientationEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "fillDeviceMotionEventData"))
  Module["fillDeviceMotionEventData"] = () =>
    abort(
      "'fillDeviceMotionEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(Module, "registerDeviceMotionEventCallback")
)
  Module["registerDeviceMotionEventCallback"] = () =>
    abort(
      "'registerDeviceMotionEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "screenOrientation"))
  Module["screenOrientation"] = () =>
    abort(
      "'screenOrientation' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "fillOrientationChangeEventData"))
  Module["fillOrientationChangeEventData"] = () =>
    abort(
      "'fillOrientationChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(
    Module,
    "registerOrientationChangeEventCallback",
  )
)
  Module["registerOrientationChangeEventCallback"] = () =>
    abort(
      "'registerOrientationChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "fillFullscreenChangeEventData"))
  Module["fillFullscreenChangeEventData"] = () =>
    abort(
      "'fillFullscreenChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(
    Module,
    "registerFullscreenChangeEventCallback",
  )
)
  Module["registerFullscreenChangeEventCallback"] = () =>
    abort(
      "'registerFullscreenChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerRestoreOldStyle"))
  Module["registerRestoreOldStyle"] = () =>
    abort(
      "'registerRestoreOldStyle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(Module, "hideEverythingExceptGivenElement")
)
  Module["hideEverythingExceptGivenElement"] = () =>
    abort(
      "'hideEverythingExceptGivenElement' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "restoreHiddenElements"))
  Module["restoreHiddenElements"] = () =>
    abort(
      "'restoreHiddenElements' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "setLetterbox"))
  Module["setLetterbox"] = () =>
    abort(
      "'setLetterbox' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "currentFullscreenStrategy"))
  Module["currentFullscreenStrategy"] = () =>
    abort(
      "'currentFullscreenStrategy' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "restoreOldWindowedStyle"))
  Module["restoreOldWindowedStyle"] = () =>
    abort(
      "'restoreOldWindowedStyle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(
    Module,
    "softFullscreenResizeWebGLRenderTarget",
  )
)
  Module["softFullscreenResizeWebGLRenderTarget"] = () =>
    abort(
      "'softFullscreenResizeWebGLRenderTarget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "doRequestFullscreen"))
  Module["doRequestFullscreen"] = () =>
    abort(
      "'doRequestFullscreen' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "fillPointerlockChangeEventData"))
  Module["fillPointerlockChangeEventData"] = () =>
    abort(
      "'fillPointerlockChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(
    Module,
    "registerPointerlockChangeEventCallback",
  )
)
  Module["registerPointerlockChangeEventCallback"] = () =>
    abort(
      "'registerPointerlockChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(
    Module,
    "registerPointerlockErrorEventCallback",
  )
)
  Module["registerPointerlockErrorEventCallback"] = () =>
    abort(
      "'registerPointerlockErrorEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "requestPointerLock"))
  Module["requestPointerLock"] = () =>
    abort(
      "'requestPointerLock' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "fillVisibilityChangeEventData"))
  Module["fillVisibilityChangeEventData"] = () =>
    abort(
      "'fillVisibilityChangeEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(
    Module,
    "registerVisibilityChangeEventCallback",
  )
)
  Module["registerVisibilityChangeEventCallback"] = () =>
    abort(
      "'registerVisibilityChangeEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerTouchEventCallback"))
  Module["registerTouchEventCallback"] = () =>
    abort(
      "'registerTouchEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "fillGamepadEventData"))
  Module["fillGamepadEventData"] = () =>
    abort(
      "'fillGamepadEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerGamepadEventCallback"))
  Module["registerGamepadEventCallback"] = () =>
    abort(
      "'registerGamepadEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(Module, "registerBeforeUnloadEventCallback")
)
  Module["registerBeforeUnloadEventCallback"] = () =>
    abort(
      "'registerBeforeUnloadEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "fillBatteryEventData"))
  Module["fillBatteryEventData"] = () =>
    abort(
      "'fillBatteryEventData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "battery"))
  Module["battery"] = () =>
    abort(
      "'battery' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "registerBatteryEventCallback"))
  Module["registerBatteryEventCallback"] = () =>
    abort(
      "'registerBatteryEventCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "setCanvasElementSize"))
  Module["setCanvasElementSize"] = () =>
    abort(
      "'setCanvasElementSize' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getCanvasElementSize"))
  Module["getCanvasElementSize"] = () =>
    abort(
      "'getCanvasElementSize' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "demangle"))
  Module["demangle"] = () =>
    abort(
      "'demangle' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "demangleAll"))
  Module["demangleAll"] = () =>
    abort(
      "'demangleAll' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "jsStackTrace"))
  Module["jsStackTrace"] = () =>
    abort(
      "'jsStackTrace' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stackTrace"))
  Module["stackTrace"] = () =>
    abort(
      "'stackTrace' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getEnvStrings"))
  Module["getEnvStrings"] = () =>
    abort(
      "'getEnvStrings' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "checkWasiClock"))
  Module["checkWasiClock"] = () =>
    abort(
      "'checkWasiClock' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToI64"))
  Module["writeI53ToI64"] = () =>
    abort(
      "'writeI53ToI64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToI64Clamped"))
  Module["writeI53ToI64Clamped"] = () =>
    abort(
      "'writeI53ToI64Clamped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToI64Signaling"))
  Module["writeI53ToI64Signaling"] = () =>
    abort(
      "'writeI53ToI64Signaling' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToU64Clamped"))
  Module["writeI53ToU64Clamped"] = () =>
    abort(
      "'writeI53ToU64Clamped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeI53ToU64Signaling"))
  Module["writeI53ToU64Signaling"] = () =>
    abort(
      "'writeI53ToU64Signaling' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "readI53FromI64"))
  Module["readI53FromI64"] = () =>
    abort(
      "'readI53FromI64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "readI53FromU64"))
  Module["readI53FromU64"] = () =>
    abort(
      "'readI53FromU64' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "convertI32PairToI53"))
  Module["convertI32PairToI53"] = () =>
    abort(
      "'convertI32PairToI53' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "convertU32PairToI53"))
  Module["convertU32PairToI53"] = () =>
    abort(
      "'convertU32PairToI53' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "setImmediateWrapped"))
  Module["setImmediateWrapped"] = () =>
    abort(
      "'setImmediateWrapped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "clearImmediateWrapped"))
  Module["clearImmediateWrapped"] = () =>
    abort(
      "'clearImmediateWrapped' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "polyfillSetImmediate"))
  Module["polyfillSetImmediate"] = () =>
    abort(
      "'polyfillSetImmediate' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "uncaughtExceptionCount"))
  Module["uncaughtExceptionCount"] = () =>
    abort(
      "'uncaughtExceptionCount' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "exceptionLast"))
  Module["exceptionLast"] = () =>
    abort(
      "'exceptionLast' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "exceptionCaught"))
  Module["exceptionCaught"] = () =>
    abort(
      "'exceptionCaught' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "ExceptionInfo"))
  Module["ExceptionInfo"] = () =>
    abort(
      "'ExceptionInfo' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "CatchInfo"))
  Module["CatchInfo"] = () =>
    abort(
      "'CatchInfo' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "exception_addRef"))
  Module["exception_addRef"] = () =>
    abort(
      "'exception_addRef' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "exception_decRef"))
  Module["exception_decRef"] = () =>
    abort(
      "'exception_decRef' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "Browser"))
  Module["Browser"] = () =>
    abort(
      "'Browser' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "funcWrappers"))
  Module["funcWrappers"] = () =>
    abort(
      "'funcWrappers' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "getFuncWrapper"))
  Module["getFuncWrapper"] = () =>
    abort(
      "'getFuncWrapper' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "setMainLoop"))
  Module["setMainLoop"] = () =>
    abort(
      "'setMainLoop' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "wget"))
  Module["wget"] = () =>
    abort(
      "'wget' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "FS"))
  Module["FS"] = () =>
    abort(
      "'FS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "MEMFS"))
  Module["MEMFS"] = () =>
    abort(
      "'MEMFS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "TTY"))
  Module["TTY"] = () =>
    abort(
      "'TTY' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "PIPEFS"))
  Module["PIPEFS"] = () =>
    abort(
      "'PIPEFS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "SOCKFS"))
  Module["SOCKFS"] = () =>
    abort(
      "'SOCKFS' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "_setNetworkCallback"))
  Module["_setNetworkCallback"] = () =>
    abort(
      "'_setNetworkCallback' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "tempFixedLengthArray"))
  Module["tempFixedLengthArray"] = () =>
    abort(
      "'tempFixedLengthArray' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "miniTempWebGLFloatBuffers"))
  Module["miniTempWebGLFloatBuffers"] = () =>
    abort(
      "'miniTempWebGLFloatBuffers' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "heapObjectForWebGLType"))
  Module["heapObjectForWebGLType"] = () =>
    abort(
      "'heapObjectForWebGLType' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "heapAccessShiftForWebGLHeap"))
  Module["heapAccessShiftForWebGLHeap"] = () =>
    abort(
      "'heapAccessShiftForWebGLHeap' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "GL"))
  Module["GL"] = () =>
    abort(
      "'GL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGet"))
  Module["emscriptenWebGLGet"] = () =>
    abort(
      "'emscriptenWebGLGet' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "computeUnpackAlignedImageSize"))
  Module["computeUnpackAlignedImageSize"] = () =>
    abort(
      "'computeUnpackAlignedImageSize' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGetTexPixelData"))
  Module["emscriptenWebGLGetTexPixelData"] = () =>
    abort(
      "'emscriptenWebGLGetTexPixelData' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGetUniform"))
  Module["emscriptenWebGLGetUniform"] = () =>
    abort(
      "'emscriptenWebGLGetUniform' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "webglGetUniformLocation"))
  Module["webglGetUniformLocation"] = () =>
    abort(
      "'webglGetUniformLocation' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (
  !Object.getOwnPropertyDescriptor(
    Module,
    "webglPrepareUniformLocationsBeforeFirstUse",
  )
)
  Module["webglPrepareUniformLocationsBeforeFirstUse"] = () =>
    abort(
      "'webglPrepareUniformLocationsBeforeFirstUse' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "webglGetLeftBracePos"))
  Module["webglGetLeftBracePos"] = () =>
    abort(
      "'webglGetLeftBracePos' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "emscriptenWebGLGetVertexAttrib"))
  Module["emscriptenWebGLGetVertexAttrib"] = () =>
    abort(
      "'emscriptenWebGLGetVertexAttrib' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "writeGLArray"))
  Module["writeGLArray"] = () =>
    abort(
      "'writeGLArray' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "AL"))
  Module["AL"] = () =>
    abort(
      "'AL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "SDL_unicode"))
  Module["SDL_unicode"] = () =>
    abort(
      "'SDL_unicode' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "SDL_ttfContext"))
  Module["SDL_ttfContext"] = () =>
    abort(
      "'SDL_ttfContext' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "SDL_audio"))
  Module["SDL_audio"] = () =>
    abort(
      "'SDL_audio' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "SDL"))
  Module["SDL"] = () =>
    abort(
      "'SDL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "SDL_gfx"))
  Module["SDL_gfx"] = () =>
    abort(
      "'SDL_gfx' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "GLUT"))
  Module["GLUT"] = () =>
    abort(
      "'GLUT' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "EGL"))
  Module["EGL"] = () =>
    abort(
      "'EGL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "GLFW_Window"))
  Module["GLFW_Window"] = () =>
    abort(
      "'GLFW_Window' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "GLFW"))
  Module["GLFW"] = () =>
    abort(
      "'GLFW' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "GLEW"))
  Module["GLEW"] = () =>
    abort(
      "'GLEW' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "IDBStore"))
  Module["IDBStore"] = () =>
    abort(
      "'IDBStore' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "runAndAbortIfError"))
  Module["runAndAbortIfError"] = () =>
    abort(
      "'runAndAbortIfError' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "Asyncify"))
  Module["Asyncify"] = () =>
    abort(
      "'Asyncify' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "Fibers"))
  Module["Fibers"] = () =>
    abort(
      "'Fibers' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "warnOnce"))
  Module["warnOnce"] = () =>
    abort(
      "'warnOnce' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stackSave"))
  Module["stackSave"] = () =>
    abort(
      "'stackSave' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stackRestore"))
  Module["stackRestore"] = () =>
    abort(
      "'stackRestore' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stackAlloc"))
  Module["stackAlloc"] = () =>
    abort(
      "'stackAlloc' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "AsciiToString"))
  Module["AsciiToString"] = () =>
    abort(
      "'AsciiToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stringToAscii"))
  Module["stringToAscii"] = () =>
    abort(
      "'stringToAscii' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "UTF16ToString"))
  Module["UTF16ToString"] = () =>
    abort(
      "'UTF16ToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF16"))
  Module["stringToUTF16"] = () =>
    abort(
      "'stringToUTF16' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF16"))
  Module["lengthBytesUTF16"] = () =>
    abort(
      "'lengthBytesUTF16' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "UTF32ToString"))
  Module["UTF32ToString"] = () =>
    abort(
      "'UTF32ToString' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "stringToUTF32"))
  Module["stringToUTF32"] = () =>
    abort(
      "'stringToUTF32' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "lengthBytesUTF32"))
  Module["lengthBytesUTF32"] = () =>
    abort(
      "'lengthBytesUTF32' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "allocateUTF8"))
  Module["allocateUTF8"] = () =>
    abort(
      "'allocateUTF8' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
if (!Object.getOwnPropertyDescriptor(Module, "allocateUTF8OnStack"))
  Module["allocateUTF8OnStack"] = () =>
    abort(
      "'allocateUTF8OnStack' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
    );
Module["writeStackCookie"] = writeStackCookie;
Module["checkStackCookie"] = checkStackCookie;
if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_NORMAL"))
  Object.defineProperty(Module, "ALLOC_NORMAL", {
    configurable: true,
    get: function () {
      abort(
        "'ALLOC_NORMAL' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
      );
    },
  });
if (!Object.getOwnPropertyDescriptor(Module, "ALLOC_STACK"))
  Object.defineProperty(Module, "ALLOC_STACK", {
    configurable: true,
    get: function () {
      abort(
        "'ALLOC_STACK' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the FAQ)",
      );
    },
  });
var calledRun;
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
}
var calledMain = false;
// dependenciesFulfilled = function runCaller() {
//   if (!calledRun) run();
//   if (!calledRun) dependenciesFulfilled = runCaller;
// };
function callMain(args) {
  assert(
    runDependencies == 0,
    'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])',
  );
  assert(
    __ATPRERUN__.length == 0,
    "cannot call main when preRun functions remain to be called",
  );
  var entryFunction = Module["_main"];
  args = args || [];
  var argc = args.length + 1;
  var argv = stackAlloc((argc + 1) * 4);
  HEAP32[argv >> 2] = allocateUTF8OnStack(thisProgram);
  for (var i = 1; i < argc; i++) {
    HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1]);
  }
  HEAP32[(argv >> 2) + argc] = 0;
  try {
    var ret = entryFunction(argc, argv);
    exit(ret, true);
    return ret;
  } catch (e) {
    return handleException(e);
  } finally {
    calledMain = true;
  }
}
function stackCheckInit() {
  _emscripten_stack_init();
  writeStackCookie();
}
function run(args) {
  args = args || arguments_;
  if (runDependencies > 0) {
    return;
  }
  stackCheckInit();
  shouldRunNow = true;
  preRun();
  if (runDependencies > 0) {
    return;
  }
  function doRun() {
    if (calledRun) return;
    calledRun = true;
    Module["calledRun"] = true;
    if (ABORT) return;
    initRuntime();
    FS.writeFile('./output.elf', elffile);
    preMain();
    if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
    if (shouldRunNow) callMain(args);
    postRun();
  }
  if (Module["setStatus"]) {
    Module["setStatus"]("Running...");
    setTimeout(function () {
      setTimeout(function () {
        Module["setStatus"]("");
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
  // shouldRunNow = false;
  // calledMain = false;
  // calledRun = false;
  // runtimeInitialized = false;
}
Module["run"] = run;
function checkUnflushedContent() {
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = (x) => {
    has = true;
  };
  try {
    ___stdio_exit();
    ["stdout", "stderr"].forEach(function (name) {
      var info = FS.analyzePath("/dev/" + name);
      if (!info) return;
      var stream = info.object;
      var rdev = stream.rdev;
      var tty = TTY.ttys[rdev];
      if (tty && tty.output && tty.output.length) {
        has = true;
      }
    });
  } catch (e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce(
      "stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the FAQ), or make sure to emit a newline when you printf etc.",
    );
  }
}
function exit(status, implicit) {
  EXITSTATUS = status;
  if (!runtimeKeepaliveCounter) {
    checkUnflushedContent();
  }
  if (keepRuntimeAlive()) {
    if (!implicit) {
      var msg =
        "program exited (with status: " +
        status +
        "), but EXIT_RUNTIME is not set, so halting execution but not exiting the runtime or preventing further async execution (build with EXIT_RUNTIME=1, if you want a true shutdown)";
      if (status === 0){
        show_notification('The execution of the program has finished', 'success') ;
        finished = true;
      }
        err(msg);
      can_reset = true;
    }
  } else {
    exitRuntime();
  }
  procExit(status);
}
function procExit(code) {
  EXITSTATUS = code;
  if (!keepRuntimeAlive()) {
    if (Module["onExit"]) Module["onExit"](code);
    ABORT = true;
  }
  quit_(code, new ExitStatus(code));
}
if (Module["preInit"]) {
  if (typeof Module["preInit"] == "function")
    Module["preInit"] = [Module["preInit"]];
  while (Module["preInit"].length > 0) {
    Module["preInit"].pop()();
  }
}
var shouldRunNow = false;

function preprocess_sail(elffile, enablefpd, enablevec, entry_add){
  inputelffile = elffile;
  // run(["--config-flags", "4"]);
  // enablefpd = true;
  // console.log("FPD y VEC: ", enablefpd, enablevec);
  if(enablefpd)
    run(["--entry-address", entry_add, "--config-flags", "8", "-p", "output.elf"]);
  if(enablevec)
    run(["--entry-address", entry_add, "--config-flags", "4", "-p", "output.elf"]);
  if(!enablefpd && !enablevec)
    run(["--entry-address", entry_add, "--config-flags", "0", "-p", "output.elf"]);


}

function update_vector(){
  for (let au = 0; au < 31; au++){
    creator_callstack_writeRegister(3, au);
  }
}
