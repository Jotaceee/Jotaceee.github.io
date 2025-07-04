
/*
 *  Copyright 2018-2024 Felix Garcia Carballeira, Diego Camarmas Alonso, Alejandro Calderon Mateos
 *
 *  This file is part of CREATOR.
 *
 *  CREATOR is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  CREATOR is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with CREATOR.  If not, see <http://www.gnu.org/licenses/>.
 *
 */


  /* jshint esversion: 6 */

  var uielto_register_popover = {

  props:      {
                target:           { type: String, required: true },
                component:        { type: Object, required: true },
                register:         { type: Object, required: true }
              },

  data:       function () {
                return {
                  /*Register form*/
                  newValue: '',
                  precision: "true"
                }
              },

  methods:    {
                closePopover(){
                  this.$root.$emit('bv::hide::popover')
                },

                //Write the register value in the specified format
                show_value (register, view){
                  var ret = 0;

                  switch(view){
                    case "hex":
                      if (architecture.components[this._props.component.index].type == "ctrl_registers" || architecture.components[this._props.component.index].type == "v_registers" || architecture.components[this._props.component.index].type == "int_registers") {
                        ret = (((register.value).toString(16)).padStart(register.nbits/4, "0")).toUpperCase();
                      }
                      else {
                        if (architecture.components[this._props.component.index].double_precision === false) {
                          ret = bin2hex(float2bin(bi_BigIntTofloat(register.value)));
                        }
                        else {
                          ret = bin2hex(double2bin(bi_BigIntTodouble(register.value)));
                        }
                      }         
                      break;

                    case "bin":
                      if (architecture.components[this._props.component.index].type == "ctrl_registers" || architecture.components[this._props.component.index].type == "v_registers" || architecture.components[this._props.component.index].type == "int_registers") {
                        ret = (((register.value).toString(2)).padStart(register.nbits, "0"));
                      }
                      else {
                        if (architecture.components[this._props.component.index].double_precision === false) {
                          ret = float2bin(bi_BigIntTofloat(register.value));
                        }
                        else {
                          ret = double2bin(bi_BigIntTodouble(register.value));
                        }
                      }         
                      break;

                    case "signed":
                      if (architecture.components[this._props.component.index].type == "ctrl_registers" || architecture.components[this._props.component.index].type == "v_registers" || architecture.components[this._props.component.index].type == "int_registers") {
                        if ((((register.value).toString(2)).padStart(register.nbits, '0')).charAt(0) == 1){
                          ret = parseInt(register.value.toString(10))-0x100000000;
                        }
                        if ((((register.value).toString(2)).padStart(register.nbits, '0')).charAt(0) == 0){
                          ret = (register.value).toString(10);
                        }
                      }
                      else {
                        // ret = parseInt(register.value.toString(), 10) >> 0;
                        if (architecture.components[this._props.component.index].double_precision === false) {
                          ret = float2int_v2 (bi_BigIntTofloat(register.value));
                        }
                        else{
                          ret = double2int_v2 (bi_BigIntTodouble(register.value));
                        }
                      }
                      break;

                    case "unsigned":
                      if (architecture.components[this._props.component.index].type == "ctrl_registers" || architecture.components[this._props.component.index].type == "int_registers") {
                        ret = parseInt(register.value.toString(10)) >>> 0;
                      }
                      else {
                        //ret = parseInt(register.value.toString(), 10) >>> 0;
                        if (architecture.components[this._props.component.index].double_precision === false) {
                          ret = float2int_v2 (bi_BigIntTofloat(register.value)) >>> 0;
                        }
                        else{
                          ret = double2int_v2 (bi_BigIntTodouble(register.value)) >>> 0;
                        }
                      }
                      break;

                    case "char":
                      if (architecture.components[this._props.component.index].type == "ctrl_registers" || architecture.components[this._props.component.index].type == "v_registers" || architecture.components[this._props.component.index].type == "v_registers" || architecture.components[this._props.component.index].type == "int_registers") {
                        ret = hex2char8((((register.value).toString(16)).padStart(register.nbits/4, "0")));
                      }
                      else {
                        if (architecture.components[this._props.component.index].double_precision === false) {
                          ret = hex2char8(bin2hex(float2bin(bi_BigIntTofloat(register.value))));
                        }
                        else {
                          ret = hex2char8(bin2hex(double2bin(bi_BigIntTodouble(register.value))));
                        }
                      } 
                      break;

                    case "ieee32":
                      if (architecture.components[this._props.component.index].type == "ctrl_registers" || architecture.components[this._props.component.index].type == "v_registers" || architecture.components[this._props.component.index].type == "int_registers") {
                        ret = hex2float("0x"+(((register.value).toString(16)).padStart(8, "0")));
                      }
                      else {
                        ret = bi_BigIntTofloat(register.value);
                      }
                      break;

                    case "ieee64":
                      if (architecture.components[this._props.component.index].type == "ctrl_registers" || architecture.components[this._props.component.index].type == "v_registers" || architecture.components[this._props.component.index].type == "int_registers") {
                        ret = hex2double("0x"+(((register.value).toString(16)).padStart(16, "0")));
                      }
                      else {
                        ret = bi_BigIntTodouble(register.value);
                      }
                      break;
                  }

                  ret = ret.toString();

                  return ret
                  
                },

                //Update a new register value
                update_register(comp, elem, type, precision){
                  for (var i = 0; i < architecture.components[comp].elements.length; i++) {
                    if(type == "int_registers" || type == "ctrl_registers"){
                      if(architecture.components[comp].elements[i].name == elem && this.newValue.match(/^0x/)){
                        var value = this.newValue.split("x");
                        if(value[1].length * 4 > architecture.components[comp].elements[i].nbits){
                          value[1] = value[1].substring(((value[1].length * 4) - architecture.components[comp].elements[i].nbits)/4, value[1].length)
                        }
                        writeRegister(parseInt(value[1], 16), comp, i, "int_registers");
                      }
                      else if(architecture.components[comp].elements[i].name == elem && this.newValue.match(/^(\d)+/)){
                        writeRegister(parseInt(this.newValue,10), comp, i, "int_registers");
                      }
                      else if(architecture.components[comp].elements[i].name == elem && this.newValue.match(/^-/)){
                        writeRegister(parseInt(this.newValue,10), comp, i, "int_registers");
                      }
                    }
                    else if(type =="fp_registers"){
                      if(precision === false){
                        if(architecture.components[comp].elements[i].name == elem && this.newValue.match(/^0x/)){
                          writeRegister(hex2float(this.newValue), comp, i, "SFP-Reg");
                        }
                        else if(architecture.components[comp].elements[i].name == elem && this.newValue.match(/^(\d)+/)){
                          writeRegister(parseFloat(this.newValue, 10), comp, i, "SFP-Reg");
                        }
                        else if(architecture.components[comp].elements[i].name == elem && this.newValue.match(/^-/)){
                          writeRegister(parseFloat(this.newValue, 10), comp, i, "SFP-Reg");
                        }
                      }

                      else if(precision === true){
                        if(architecture.components[comp].elements[i].name == elem && this.newValue.match(/^0x/)){
                          writeRegister(hex2double(this.newValue), comp, i, "DFP-Reg");
                        }
                        else if(architecture.components[comp].elements[i].name == elem && this.newValue.match(/^(\d)+/)){
                          writeRegister(parseFloat(this.newValue, 10), comp, i, "DFP-Reg");
                        }
                        else if(architecture.components[comp].elements[i].name == elem && this.newValue.match(/^-/)){
                          writeRegister(parseFloat(this.newValue, 10), comp, i, "DFP-Reg");
                        }
                      }
                    }
                  }
                  this.newValue = '';

                  // Google Analytics
                  creator_ga('data', 'data.change', 'data.change.register_value');
                  creator_ga('data', 'data.change', 'data.change.register_value_' + elem);
                },

                get_cols(index)
                {
                  if (architecture.components[index].double_precision === true){
                    return 3;
                  }
                  else{
                    return 2;
                  }
                },

                button_sel_vec_pos(total_elm){
                  return  '<b-dropdown size="sm" text="Small" class="m-2">' +
                            '<b-dropdown-item-button' +
                            '  v-for="i in total_elm"' +
                            '  :key="index"' +
                            '  @click="show_vec_pos(i)"'+
                            '>' +
                            '  {{ i }}' +
                            '</b-dropdown-item-button>' +
                          '</b-dropdown>'
                }



              },

template:     '<b-popover :target="target" ' +
              '           triggers="click blur" ' +
              '           class="popover">' +
              '  <template v-slot:title>' +
              '    <b-button @click="closePopover" class="close" aria-label="Close">' +
              '      <span class="d-inline-block" aria-hidden="true">&times;</span>' +
              '    </b-button>' +
              '    {{register.name.join(\' | \')}}' +
              '  </template>' +
              '' +
              '  <table class="table table-bordered table-sm popoverText">' +
              '    <tbody>' +
              '      <tr>' +
              '        <td>Hex.</td>' +
              '        <td>' +
              '          <b-badge class="registerPopover">' +
              '            {{show_value(register, \'hex\')}}' +
              '          </b-badge>' +
              '        </td>' +
              '      </tr>' +
              '      <tr>' +
              '        <td>Binary</td>' +
              '        <td>' +
              '          <b-badge class="registerPopover">' +
              '            {{show_value(register, \'bin\')}}' +
              '          </b-badge>' +
              '        </td>' +
              '      </tr>' +
              '      <tr v-if="architecture.components[component.index].type != \'fp_registers\'">' +
              '        <td>Signed</td>' +
              '        <td>' +
              '          <b-badge class="registerPopover">' +
              '            {{show_value(register, \'signed\')}}' +
              '          </b-badge>' +
              '        </td>' +
              '      </tr>' +
              '      <tr v-if="architecture.components[component.index].type != \'fp_registers\'">' +
              '        <td>Unsig.</td>' +
              '        <td>' +
              '          <b-badge class="registerPopover">' +
              '            {{show_value(register, \'unsigned\')}}' +
              '          </b-badge>' +
              '        </td>' +
              '      </tr>' +
              '      <tr v-if="architecture.components[component.index].type != \'fp_registers\'">' +
              '        <td>Char</td>' +
              '        <td>' +
              '          <b-badge class="registerPopover">' +
              '            {{show_value(register, \'char\')}}' +
              '          </b-badge>' +
              '        </td>' +
              '      </tr>' +
              '      <tr>' +
              '        <td>IEEE 754 (32 bits)</td>' +
              '        <td>' +
              '          <b-badge class="registerPopover">' +
              '            {{show_value(register, \'ieee32\')}}' +
              '          </b-badge>' +
              '        </td>' +
              '      </tr>' +

              '      <tr>' +
              '        <td>IEEE 754 (64 bits)</td>' +
              '        <td>' +
              '          <b-badge class="registerPopover">' +
              '            {{show_value(register, \'ieee64\')}}' +
              '          </b-badge>' +
              '        </td>' +
              '      </tr>' +

              '    </tbody>' +
              '  </table>' +
              '' +
              '   <b-container fluid align-h="center" class="mx-0">' +
              '     <b-row align-h="center" :cols="get_cols(component.index)">' +
              ' ' +
              '       <b-col class="popoverFooter">' +
              '         <b-form-input v-model="newValue" ' +
              '                       type="text" ' +
              '                       size="sm" ' +
              '                       title="New Register Value" ' +
              '                       placeholder="Enter new value">' +
              '         </b-form-input>' +
              '       </b-col>' +
              ' ' +
              '       <b-col v-if="architecture.components[component.index].double_precision == true">' +
              '         <b-form-select v-model="precision"' +
              '                        size="sm" block>' +
              '           <b-form-select-option value="false"       >Simple Precision</b-form-select-option>' +
              '           <b-form-select-option value="true" active>Double Precision</b-form-select-option>' +
              '         </b-form-select>' +
              '       </b-col>' +
              ' ' +
              '       <b-col>' +
              '         <b-button class="btn btn-primary btn-sm w-100" ' +
              '                   @click="update_register(component.index, register.name, architecture.components[component.index].type, precision==\'true\')">' +
              '           Update' +
              '          </b-button>' +
              '       </b-col>' +
              ' ' +
              '     </b-row>' +
              '   </b-container>' +
              '</b-popover>'

  }

  Vue.component('popover-register', uielto_register_popover);


var uielto_register_popover_vec = {
  props: {
    target: { type: String, required: true },
    component: { type: Object, required: true },
    register: { type: Object, required: true }
  },
  data: function () {
    return { newValue: "", precision: "true", result: ["0","0","0","0","0","0","0","0"] };
  },
  methods: {
    closePopover() {
      this.$root.$emit("bv::hide::popover");
    },
    show_value_vec(register, view="hex") {
      this.result.length = 0;
      for (var i = 0; i < architecture.components[3].total_elements; i++){
        switch (view) {
          case "hex":
            var ret_val = (512 / length_vext) - i - 1;
            this.result.push("0x" + register.value.slice(ret_val * length_vext / 4, (ret_val + 1) * length_vext / 4 ));
            break;
          case "bin":
            var ret_val = (512 / length_vext) - i - 1;
            var ret = register.value.slice(ret_val * length_vext / 4, (ret_val + 1) * length_vext / 4 );

            if (ret.charAt(0) === 1){
              if (length_vext === 8){
                this.result.push(parseInt(ret, 16) - 256);

              } else if (length_vext === 16){
                this.result.push(parseInt(ret, 16) - 65536);

              } else if (length_vext === 32){
                this.result.push(parseInt(ret, 16) - 4294967296);

              } else {
                this.result.push(parseInt(ret, 16) - 18446744073709551616n);
              }
            }
            else
              this.result.push(parseInt(ret, 16));
            break;
          case "signed":
            var ret_val = (512 / length_vext) - i - 1;
            var ret = register.value.slice(ret_val * length_vext / 4, (ret_val + 1) * length_vext / 4 );

            if (ret.charAt(0) === 1){
              if (length_vext === 8){
                this.result.push(parseInt(ret, 16) - 256);

              } else if (length_vext === 16){
                this.result.push(parseInt(ret, 16) - 65536);

              } else if (length_vext === 32){
                this.result.push(parseInt(ret, 16) - 4294967296);

              } else {
                this.result.push(parseInt(ret, 16) - 18446744073709551616n);
              }
            }
            else
              this.result.push(parseInt(ret, 16));
            break;
          case "unsigned":
            var ret_val = (512 / length_vext) - 1 - i;
            var ret = register.value.slice(ret_val * length_vext / 4, (ret_val + 1) * length_vext / 4 );
            this.result.push(parseInt(ret.toString(10) >>> 0));
            break;
        }
      }
      console.log(this.result);
      // ret = ret.toString();
      // return result;
    },
    
    get_cols(index) {
      if (architecture.components[index].double_precision === true) {
        return 3;
      } else {
        return 2;
      }
    }
  },
  template:
    '<b-popover :target="target" ' +
    '           triggers="click blur" ' +
    '           class="popover">' +
    "  <template v-slot:title>" +
    '    <b-button @click="closePopover" class="close" aria-label="Close">' +
    '      <span class="d-inline-block" aria-hidden="true">&times;</span>' +
    "    </b-button>" +
    "    {{register.name.join(' | ')}}" +
    "  </template>" +
    "" +
    '  <b-container fluid>'+
    '   <b-row>'+
    '     <b-col class ="flexbox_popover center">Metadata</b-col>'+
    '     <b-col class ="flexbox_popover center">Nbits</b-col>'+
    '     <b-col class ="flexbox_popover center">Length</b-col>'+
    '     <b-col class ="flexbox_popover center">Elems</b-col>'+
    '     <b-col class ="flexbox_popover center">Elem/op</b-col>'+
    '   </b-row>'+
    '   <b-row>'+
    '     <b-col class ="flexbox_popover center"></b-col>'+
    '     <b-col class ="flexbox_popover center">{{ register.nbits }}</b-col>'+
    '     <b-col class ="flexbox_popover center">{{ register.length_elem }}</b-col>'+
    '     <b-col class ="flexbox_popover center">{{ architecture.components[3].total_elements }}</b-col>'+
    '     <b-col class ="flexbox_popover center"></b-col>'+
    '   </b-row>'+
    '  </b-container>'+

    '  <b-container fluid>'+
    '   <b-row style="margin:10px">'+
    '     <b-col class=" center">'+
    '       <b-button-group vertical>' +
    '         <b-button class="button_vec" @click="show_value_vec(register, \'hex\')">Hex</b-button>' +
    '         <b-button class="button_vec" @click="show_value_vec(register, \'bin\')">Bin</b-button>' +
    '         <b-button class="button_vec" @click="show_value_vec(register, \'signed\')">Signed</b-button>' +
    '         <b-button class="button_vec" @click="show_value_vec(register, \'unsigned\')">Unsigned</b-button>' +
    '       </b-button-group>'+
    '     </b-col>'+
    '     <b-col class="center">'+
    '       <table class="table table-bordered table-sm popoverText">' +
    '         <tbody>'+
    '           <tr v-for="(value, index) in result">'+
    '             <td> {{register.name[0]}}[{{index}}]</td>'+
    '             <td>' +
    '               <b-badge class="registerPopover">' +
    '                 {{value}}' +
    '               </b-badge>' +
    '             </td>' +
    '           </tr>' +
    '         </tbody>'+
    '       </table>'+
    '     </b-col>'+
    '   </b-row>'+
    '  </b-container>'+
    "</b-popover>",
};
Vue.component("popover-register-vec", uielto_register_popover_vec);



