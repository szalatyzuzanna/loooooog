// START odoo module encapsulation
odoo.define('inventory_log.inv_upd', function (require) {
"use strict";

var AbstractAction = require('web.AbstractAction');
var ajax = require('web.ajax');
var core = require('web.core');

var Session = require('web.session');
var _t = core._t;

var QWeb = core.qweb;

var InvUpdate = AbstractAction.extend({
    /* EVENTS */
     events: {
        "click #add": function(e) {
            console.log("Session lines 2 ",Session.lines);
            e.preventDefault();
            if (!Session.inv_orig){
                $(".modal-title").html(_t("Location not set"));
                $(".modal").modal('show')
                return;
            }
            var domain = [['type','=','product']];
            this.do_action('inventory_log.product_kanban_action',{
                    additional_context: {
                        domain: domain,
                        // n_action: "inventory_log.inv_upd",
                    },
                    clear_breadcrumbs: true,
                });
        },
        "click .loc": function(e) {
            e.preventDefault();

            this.do_action('inventory_log.location_kanban_action_duwi',{
                additional_context: {
                    type: "orig",
                    n_action: "inventory_log.inv_upd",
                },
                clear_breadcrumbs: true
            });

        },
        "click .confirm": function(e) {
            var self = this;
            console.log("Session lines 1 ",Session.lines);
            if (Object.keys(Session.lines).length < 1){
                $(".modal-title").html(_t("Number of products must be higher than 0"));
                // $(".modal-body").html(_t("<p>Number of products must be higher than 0.</p>"));
                $(".modal").modal('show')
                return;
            }
            this._rpc({
                model: 'stock.warehouse',
                method: 'create_inventory',
                args: [Session.lines, Session.uid, $('#motive').val()],
            }).then(function(res){
                Session.inv_orig = undefined;
                Session.a_type = undefined;
                Session.lines = {};
                self.do_action('inventory_log.main_screen',{
                        clear_breadcrumbs: true
                    });
                });
        },
        "click .scrap": function(e) {
            var self = this;
            if (Object.keys(Session.lines).length < 1){
                $(".modal-title").html(_t("Number of products must be higher than 0"));
                // $(".modal-body").html(_t("<p>Number of products must be higher than 0.</p>"));
                $(".modal").modal('show')
                return;
            }
            console.log('session lines scrap', Session.lines)
            this._rpc({
                model: 'stock.warehouse',
                method: 'create_scrap',
                args: [Session.lines, Session.uid, $('#motive').val()],
            }).then(function(res){
                Session.inv_orig = undefined;
                Session.a_type = undefined;
                Session.lines = {};
                self.do_action('inventory_log.main_screen',{
                        clear_breadcrumbs: true
                    });
                });
        },
        "click .exit": function() {
            // Session.location = false;
            Session.inv_orig = undefined;
            Session.a_type = undefined;

            Session.lines = {};
            this.do_action('inventory_log.main_screen',{
                    clear_breadcrumbs: true
                });
        },
        "click .trash": function(e) {
            var ids = $(e.currentTarget).parent().attr('class').split(/_/);
            Session.lines[ids[1]][ids[2]][ids[3]] && delete Session.lines[ids[1]][ids[2]][ids[3]];
            if (Object.keys(Session.lines[ids[1]]).length == 1){
                $(e.currentTarget).parent().parent().remove();
                delete Session.lines[ids[1]];
            }
            else 
                $(e.currentTarget).parent().remove();
        },
        "change .qty": function(e){
            var ids = $(e.currentTarget).parent().attr('class').split(/_/);
            Session.lines[ids[1]][ids[2]][ids[3]].qty = parseFloat($(e.currentTarget).val());
        },
        "click .selected_lot": function(e) {
            var self = this;
            e.preventDefault();
            var ids = $(e.currentTarget).parent().attr('class').split(/_/);
            Session.update_inv = {
                'location_id':ids[1],
                'product_id':ids[2],
                'lot_id':ids[3]
            }
            console.log("Session.update_inv  ",Session.update_inv )
            console.log("current target $(e.currentTarget) ",$(e.currentTarget))
            console.log("parent ",$(e.currentTarget).parent())
            var id = $(e.currentTarget).parent().attr('class').split(/_/)[2];
            console.log("id ",id)
            var m = new Date();
            var domain = false;
            var dateString =
                m.getUTCFullYear() + "-" +
                ("0" + (m.getUTCMonth()+1)).slice(-2) + "-"+
                ("0" + m.getUTCDate()).slice(-2) + " " +
                ("0" + m.getUTCHours()).slice(-2) + ":" +
                ("0" + m.getUTCMinutes()).slice(-2) + ":" +
                ("0" + m.getUTCSeconds()).slice(-2);
            console.log("Today tine ",dateString);
            /*if(Session.a_type == 'inv'){
                domain = [['product_id','=',parseInt(id)],['expiration_date','>',dateString]];
            }
            else{
                domain = [['product_id','=',parseInt(id)]];
            }*/
            domain = [['product_id','=',parseInt(id)]];
            console.log("Domain ",domain)
            this.do_action('inventory_log.lot_kanban_action',{
                additional_context: {
                    domain: domain,
                },/*
                clear_breadcrumbs: true*/
            });
        },
    },
    init: function(parent, action) {
        var self = this;
        this._super.apply(this, arguments);
        this.a_type = action.a_type || false;
        if(!Session.a_type){
            Session.a_type = this.a_type;
        }
        
        console.log("init Session.a_type ",Session.a_type)
    },
    start: async function () {
        this._super();
        var self = this;
        if (typeof(Session.inv_orig) == "undefined")
            Session.inv_orig = false;
        if (Session.orig){
            Session.inv_orig = Session.orig;
            Session.orig = undefined;
        }
        

        if (typeof(Session.lines) == "undefined")
            Session.lines = {};
        console.log("INVE ",Session.update_inv)
        if(Session.lines && Session.update_inv) {
            var temp = Session.lines[Session.update_inv.location_id][Session.update_inv.product_id][-1]
            console.log("Temp ",temp)
            console.log("sesison lines 1 ",Session.lines)
            delete Session.lines[Session.update_inv.location_id][Session.update_inv.product_id][-1]
            temp.lot_id = Session.changed_lot
            console.log("Temp 2 ",temp)
            console.log("sesison lines 2 ",Session.lines)
            Session.lines[Session.update_inv.location_id][Session.update_inv.product_id][Session.changed_lot.id] = temp
            Session.changed_lot = undefined;
            Session.update_inv = undefined;
        }
        
        console.log("Session lines ", Session.lines)
        core.bus.on('barcode_scanned', this, this._onBarcodeScanned);
        self.$el.html( QWeb.render("InvUpdXML", {location: Session.inv_orig, lines:Session.lines, a_type: Session.a_type}));
    },
    _onBarcodeScanned: function(barcode) {
        var self = this;
        var codes = self.parseBarcode(barcode)
        console.log("CODES barcpode scammed ",codes)
        core.bus.off('barcode_scanned', this, this._onBarcodeScanned);
        if(codes['product_id']){
            this._rpc({
                    model: 'stock.warehouse',
                    method: 'check_barcode_inv',
                    args: [codes['product_id'],codes['lote']],
                }).then(function(res){
                    console.log("RES codes ",res)
                    if (res['l'].length > 0){
                        Session.inv_orig = res['l'][0]
                        self.$el.html( QWeb.render("InvUpdXML", {'location':Session.inv_orig, 'lines':Session.lines,a_type: Session.a_type}));
                    }
                    else if (res['p'].length > 0){
                        if (!Session.inv_orig){
                            $(".modal-title").html(_t("Location not set"));
                            $(".modal").modal('show')
                        }
                        else{
                            res['p'].forEach(function(p){
                                if (!Session.lines[Session.inv_orig.id])
                                    Session.lines[Session.inv_orig.id] = {'name':Session.inv_orig.display_name}
                                if (!Session.lines[Session.inv_orig.id][p.id]){
                                    Session.lines[Session.inv_orig.id][p.id] = {}
                                    Session.lines[Session.inv_orig.id][p.id][res['lot'].id] = {lot_id:res['lot'] ,name:p.display_name,qty:parseFloat($("#code").html()) || 1};
                                }
                                   
                                else if(Session.lines[Session.inv_orig.id][p.id] && !Session.lines[Session.inv_orig.id][p.id][res['lot'].id]){
                                    Session.lines[Session.inv_orig.id][p.id][res['lot'].id] = {lot_id:res['lot'] ,name:p.display_name,qty:parseFloat($("#code").html()) || 1};
                                }
                            });
                            self.$el.html( QWeb.render("InvUpdXML", {'location':Session.inv_orig, 'lines':Session.lines, a_type: Session.a_type}));
                        }
                    }
                    else {
                        $(".modal-title").html(_t("Barcode not found"));
                        $(".modal").modal('show')
                    }
                    core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                });
        }
        else{
            $(".modal-title").html(_t("Barcode not found"));
            $(".modal").modal('show')
            core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
        }
    }, 
    parseBarcode: function(barcode) {
        //let barcode = '02084567890123450134567891234567370112\F1089B237896541236547891512345';
        const regexp = /(01|10|15|17|37)/g;
        let exists = false
        let qty = "";
        let lote = "";
        let product_id = "";
        let proveedor = "";
        var expiration_date = "";
        let IA = 0
        let indexModified = false;
        let startIndex = 0
        let endIndex = 2
        let dictIA = {
          // IA : Longitud
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
            expiration_date = String(barcode.match(/15(\d{6})/));
            expiration_date = expiration_date.split(',');
            expiration_date = expiration_date[0]  
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
                console.log("IA >", IA)
            if (IA === '' || !(IA in dictIA)) {
                exists = false
            } else {
                let codeSize = dictIA[IA];
                if (IA === '01' || IA === '02' || IA === '37'  || IA === '10'|| IA === '17'|| IA === '15') {
                    let tempCode = barcode.substring(endIndex, startIndex + codeSize)
                        console.log('tempCode' , tempCode)
                        // const regexf = /\X/g;
                        // const regexx = /[^\x1D]/g;
                        // tempCode = tempCode.replace(regexx,'')
                        // console.log('tempCode replace' , tempCode)
                        //alert(tempCode)
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
                        case '17':
                            expiration_date = tempCode
                            break
                        case '15':
                            expiration_date = tempCode
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
        return {'lote': lote, 'product_id':  product_id, 'expiration_date':expiration_date}
    },
});

core.action_registry.add('inv_upd', InvUpdate);

return InvUpdate;

});