// START odoo module encapsulation
odoo.define('inventory_log.quick_info', function (require) {
"use strict";

var AbstractAction = require('web.AbstractAction');
var ajax = require('web.ajax');
var core = require('web.core');

var Session = require('web.session');
var _t = core._t;

var QWeb = core.qweb;

var QuickInfo = AbstractAction.extend({
    /* EVENTS */
     events: {
        "click .1": function(){ $("#code").html($("#code").html() + "1");},
        "click .2": function(){ $("#code").html($("#code").html() + "2");},
        "click .3": function(){ $("#code").html($("#code").html() + "3");},
        "click .4": function(){ $("#code").html($("#code").html() + "4");},
        "click .5": function(){ $("#code").html($("#code").html() + "5");},
        "click .6": function(){ $("#code").html($("#code").html() + "6");},
        "click .7": function(){ $("#code").html($("#code").html() + "7");},
        "click .8": function(){ $("#code").html($("#code").html() + "8");},
        "click .9": function(){ $("#code").html($("#code").html() + "9");},
        "click .0": function(){ $("#code").html($("#code").html() + "0");},
        "click .dot": function(){ $("#code").html($("#code").html() + ".");},
        "click .del": function(){ $("#code").html($("#code").html().slice(0, -1));},
        "click .search_barcode": function(e) {
            this._onBarcodeManual()
        },   
        "click .search_reference": function(e) {
            this._onReferenceManual()
        },  
        "click .exit": function() {
            this.do_action({
                type: 'ir.actions.client',
                name: _t('Select Barcode'),
                tag: 'select_barcode',
                target: 'fullscreen',
            }, {clear_breadcrumbs: true}); 
        },
        "click .locat": function(e) {
            e.preventDefault();
            Session.product_list = {};
            Session.orig = undefined;
            this.do_action('inventory_log.location_kanban_action_duwi',{
                additional_context: {
                    type: "orig",
                    n_action: "inventory_log.quick_info",
                },
                clear_breadcrumbs: true
            });
        },
        "click .prod": function(e) {
            e.preventDefault();
            Session.product_list = {};
            Session.orig = undefined;
            this.do_action('inventory_log.product_kanban_action',{
                    additional_context: {
                        domain: [],
                        n_action: "inventory_log.quick_info",
                    },
                    clear_breadcrumbs: true,
                });
        },
    },

    init: function(parent, action) {
        var self = this;
        this._super.apply(this, arguments);
        this.barcode_type = action.barcode_type || false;
    },

    start: async function () {
        this._super();
        var self = this;
        core.bus.on('barcode_scanned', this, this._onBarcodeScanned);
        var args = [];
        if(Session.product_list && Object.keys(Session.product_list).length > 0)
            args = [Object.keys(Session.product_list)[0],'p'];
        else if (Session.orig)
            args = [Session.orig.id,'l'];
        if (args.length > 0)
            this._rpc({
                    model: 'stock.warehouse',
                    method: 'quick_info_by_id',
                    args: args,
                }).then(function(res){
                    if (!res){
                        self.$el.html( QWeb.render("QuickInfoXML",{type:self.barcode_type}));
                    }
                    else {       
                        res.type =self.barcode_type;
                        self.$el.html( QWeb.render("QuickInfoXML", res));
                    }
                });
        else 
            self.$el.html( QWeb.render("QuickInfoXML",{type:this.barcode_type}));
    },

    parseBarcode: function(barcode) {
        //let barcode = '02084567890123450134567891234567370112\F1089B237896541236547891512345';
        const regexp = /(01|02|10|37)/g;
        let exists = false
        let qty = "";
        let lote = "";
        let product_id = "";
        let proveedor = "";
        let IA = 0
        let indexModified = false;
        let startIndex = 0
        let endIndex = 2
           //IA: max longitud
        let dictIA = {
            '00': 20, // fija
            '01': 16, // fija
            '02': 16, // fija
            '10': 22, // hasta 22 ---- lote
            '15': 8,  // fija
            '17': 8,  // fija
            '90': 30, // hasta 30
            '91': 6,  // fija
            '37': 10, // hasta 10 ---- qty
        }

        if (barcode.search(regexp) != -1) 
            exists = true

            if (barcode.includes('01' && '10' && '15' && '37') && (barcode.search(/91\d{4}$/) === -1)){
                
                if (barcode.search(/37\d{3}$/) != -1) {
                    var lqty = barcode.substring(barcode.length - 5, barcode.length)
                    barcode = barcode.substring(0, barcode.length - 6)
                    console.log('barcode', barcode);
                }
            

                var ia_91 = "";
                var ia_37 = "";
                var ia_17 = "";
                var ia_15 = "";
                var ia_10 = "";
                var ia_02 = "";
                var ia_01 = "";
    
                ia_01 = barcode.startsWith('01');
                if (ia_01){
                product_id = barcode.match(/01(\d{14})/g);;
                //product_id = product_id.at(1);
                product_id = String(product_id).substring(2);
                barcode = barcode.replace(product_id,'')  
                console.log('product_id', product_id);
                barcode = barcode.substring(2)
                
                }
                ia_02 = barcode.startsWith('02');
                if (ia_02){
                product_id = String(barcode.match(/02(\d{14})/));
                barcode = barcode.replace(product_id,'')
                product_id = String(product_id).substring(2);
                console.log('product_id', product_id);
                }
                
                // ia_37 = barcode.includes('37')
                // if (ia_37){
                // qty = String(barcode.match(/37(\d{1,8})/g));
                // barcode = barcode.replace(qty,'')
                // qty = String(qty).substring(2);
                
                // console.log('Qty', qty);
                // }
  
                ia_15 = barcode.includes('15')
                if (ia_15){
                let index_15 = barcode.indexOf('15')  
                expiration_date = String(barcode.match(/15(\d{6})/g));
                barcode = barcode.replace(expiration_date, '')
                expiration_date = String(expiration_date).substring(2);
                console.log('Expiration Date', expiration_date);
                }
  
                ia_10 = barcode.includes('10')
                if (ia_10){
                lote = String(barcode.match(/10([^\x1D]{6,20})/g));
                lote = String(barcode).substring(2);
                console.log('Lote', lote);
                }
                
                }else{
        
        while (exists && startIndex < barcode.length) {
            IA = barcode.substring(startIndex, endIndex);
            if (IA === '' || !(IA in dictIA)) {
                exists = false
            } else {
                let codeSize = dictIA[IA];
                if (IA === '01' || IA === '02' || IA === '37'  || IA === '10') {
                    let tempCode = barcode.substring(endIndex, startIndex + codeSize)
                    if (tempCode.search(' ') != -1) {
                        let cut = tempCode.indexOf(' ')
                        startIndex = startIndex + cut + 3
                        endIndex = endIndex + cut + 3
                        tempCode = tempCode.substring(0, cut)
                        indexModified = true;
                    }
                    if( IA === '37'  || IA === '10' ) {
                        if (tempCode.search(/91\d{4}$/) != -1) {
                            proveedor = tempCode.substring(tempCode.length - 4, tempCode.length)
                            tempCode = tempCode.substring(0, tempCode.length - 6)
                        }
                    }
                    switch(IA) {
                        case '01':
                            product_id = tempCode
                            break
                        case '02':
                            product_id = tempCode
                            break
                        case '10':
                            lote = tempCode.replace(/[^A-Za-z0-9\-\/\.]/g,'')
                            break
                        case '37':
                            qty = tempCode
                            break
                    }
                }
                if(!indexModified) {
                    startIndex += codeSize
                    endIndex = 2 + startIndex
                }
                indexModified = false;

                if(qty != '' && lote != '')
                    exists = false
            }
        }
                }
        return {'qty': parseInt(qty), 'lote': lote, 'product_id':  parseInt(product_id)}
    },
    _onReferenceManual: function() {
        var self = this;
        var reference = $("#code").html();
        this._rpc({
            model: 'stock.warehouse',
            method: 'quick_info_reference',
            args: [reference],
        }).then(function(res){
            if (!res){
                $(".modal-title").html(_t("Reference not found"));
                $(".modal").modal('show');
            }
            else {    
                res.type = self.barcode_type;
                self.$el.html( QWeb.render("QuickInfoXML", res));
            }
        });
    },


    _onBarcodeManual: function() {
        var self = this;
        var barcode = $("#code").html();
        var codes = false;
        var lot_id = false;

        if(this.barcode_type === 'gs1'){
            var codes = self.parseBarcode(barcode)
            barcode = codes['product_id'].toString();
            if(codes['lote']){
                lot_id = codes['lote'].toString();
            }
        }

        this._rpc({
                model: 'stock.warehouse',
                method: 'quick_info_barcode',
                args: [barcode,self.barcode_type,lot_id],
            }).then(function(res){
                if (!res){
                    $(".modal-title").html(_t("Barcode not found"));
                    $(".modal").modal('show');
                }
                else {    
                    res.type = self.barcode_type;
                    self.$el.html( QWeb.render("QuickInfoXML", res));
                }
                core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
            });
    },
    _onBarcodeScanned: function(barcode) {
        var self = this;
        alert(barcode)

        
        core.bus.off('barcode_scanned', this, this._onBarcodeScanned);
        var codes = false;
        var lot_id = false;

        if(this.barcode_type === 'gs1'){
            var codes = self.parseBarcode(barcode)
            barcode = codes['product_id'].toString();
            if(codes['lote']){
                lot_id = codes['lote'].toString();
            }
            console.log("Codes ",codes)
        }

        this._rpc({
                model: 'stock.warehouse',
                method: 'quick_info_barcode',
                args: [barcode,self.barcode_type,lot_id],
            }).then(function(res){
                console.log("RES ",res)
                if (!res){
                    $(".modal-title").html(_t("Barcode not found"));
                    $(".modal").modal('show');
                }
                else { 
                    res.type =self.barcode_type;   
                    self.$el.html( QWeb.render("QuickInfoXML", res));
                }
                core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
            });
    }, 
});

core.action_registry.add('quick_info', QuickInfo);

return QuickInfo;

});
