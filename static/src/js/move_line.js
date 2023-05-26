// START odoo module encapsulation
odoo.define('inventory_log.move_line', function (require) {
    "use strict";
    
    var AbstractAction = require('web.AbstractAction');
    var ajax = require('web.ajax');
    var core = require('web.core');    
    var Session = require('web.session');
    var _t = core._t;
    
    var QWeb = core.qweb;
    
    var MoveLine = AbstractAction.extend({
        events: {
            "click .correct_state_of_product": function(e) {
                var self = this;
                console.log('correct_state_of_product', self)
                if ($('.correct_state_of_product').is(':checked')) {
                    console.log("MARCADO ")
                    $(".bad_quality_description_div").hide();
                    $('.quality_check').prop("checked", Session.quality_check_prev_state)
                    
                } else {
                    console.log("NO MARCADO ")
                    Session.quality_check_prev_state = $('.quality_check').is(':checked')
                    $('.quality_check').prop("checked", false);
                    $(".bad_quality_description_div").show();
                }
                self.updateQualityCheckRelatedParams(Session, Session.line.failed_expiration, Session.line.overdue_days, $('.correct_state_of_product').is(':checked'), $('.quality_check').is(':checked'), "")
            },
            "click .confirm_create_lot": function(e) {
                console.log("----------click .confirm_create_lot---------------")
                var self = this;
                e.preventDefault();
                var expiration_date = false;
                var message = false
                var quality_check = true
                var failed_expiration = false
                var overdue_days = 0
                if ($('#expiration_date').val()) {
                    expiration_date = $('#expiration_date').val() + ' 12:00:00' 
                    console.log("expiration_date ",expiration_date)
                }/* else {
                    $("#expiration_date").css('border', '1px red solid')
                    return
                }*/
                this._rpc({
                    model: 'stock.move.line',
                    method: 'create_new_lot',
                    args: [parseInt(Session.line['id']),$(".lot_name").val(),expiration_date],
                }).then(function(res) {
                    Session.line.lot_ids.push(res)
                    console.log('Session mia', Session.line)
                    Session.line.current_lot = res;
                    if (Session.company_settings.quality_control_group && Session.line.product_tracking == 'lot' && self.line.product_id['expiration_time'] != 0)
                        if (self.line.current_lot && self.line.current_lot.expiration_date) {
                            var lot_date = new Date(self.line.current_lot.expiration_date.split(' ')[0]);
                            var today = new Date();
                            var dd = String(today.getDate()).padStart(2, '0');
                            var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
                            var yyyy = today.getFullYear();
                            today = yyyy+'-'+mm+'-'+dd;
                            console.log("Today ",today)
                            var todayDate = new Date(today);
                            console.log("lot_date ",lot_date)
                            console.log("todayDate ",todayDate)
                            var diffTime = Math.abs(todayDate - lot_date);
                            var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            var productLifeTime = self.line.product_id['expiration_time']
                            var productDays = new Date(new Date().getTime()+(productLifeTime * 24 * 60 * 60 * 1000));
                            if (lot_date <= todayDate) {
                                console.log("Menor");
                                failed_expiration = true
                                quality_check = false
                                overdue_days = Math.abs(Math.ceil((productDays - lot_date) / (1000 * 60 * 60 * 24)))
                                message = "There is not enough life date"
                            } else {
                                console.log("diff days", diffDays);
                                if (diffDays < self.line.product_id['expiration_time']) {
                                    console.log('fecha minima prod - fecha lote', self.line.product_id['expiration_time'] - diffDays)
                                    failed_expiration = true
                                    quality_check = false
                                    overdue_days = Math.abs(Math.ceil((productDays - lot_date) / (1000 * 60 * 60 * 24)))
                                    message = "There is not enough life date"
                                }
                            }
                        } else if (self.line.current_lot && !self.line.current_lot.expiration_date) {
                            failed_expiration = true
                            quality_check = false
                            message = "There is no life date"
                        } 
                    self.updateQualityCheckRelatedParams(self, failed_expiration, overdue_days, self.line.correct_state_of_product, quality_check, message)
                    console.log('updateQualityCheckRelatedParams self', self)
                    $("#myModal").modal('toggle');
                    core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                    self.$el.html( QWeb.render("ShowMoveLine", {line: Session.line, options: self.conf,type:Session.picking_type_code, is_in_group:Session.company_settings.quality_control_group}));
                    if ($('.correct_state_of_product').is(':checked')) {
                        console.log("MARCADO ")
                        $(".bad_quality_description_div").hide();
                        $('.quality_check').prop("checked", Session.quality_check_prev_state)
                        
                    } else {
                        console.log("NO MARCADO ")
                        Session.quality_check_prev_state = $('.quality_check').is(':checked')
                        $('.quality_check').prop("checked", false);
                        $(".bad_quality_description_div").show();
                    }
                    console.log("-----------------end-------------------")
                });
            },
            "click .create_lot": function(e) {
                e.preventDefault();
                if (Session.company_settings.lot_sequence) {
                    this._rpc({
                        model: 'stock.move',
                        method: 'get_sequence',
                        args: [],
                    }).then(function(res) {
                        $(".lot_name").val(res)
                        $("#myModal").modal('toggle');
                    });
                }
                else {
                    $("#myModal").modal('toggle');
                }
            },
            "click .validate_move_lines": function(e) {
                e.preventDefault();
                var self = this;
                var checked_quality = Session.line.quality_check;
                var correct_state_of_product = Session.line.correct_state_of_product;
                var bad_quality_description = $('.bad_quality_description').val();
                console.log("seece ",parseInt($('.selected_lot').attr('id')))
                console.log("is checked")
                console.log("Session.line.reason_quality", Session.line.reason_quality)
                if (parseInt($(".done").val()) <  parseInt($(".to_do_total").val()))
                    $('#modal').modal('toggle');
                else {
                    console.log('Session mia', Session) 
                    this._rpc({
                        model: 'stock.move.line',
                        method: 'create_move_line',
                        args: [[parseInt(Session.line['id'])], self.parseQuantity($(".done").val()), parseInt($('.selected_lot').attr('id')), $('.selected_lot').html(),
                        Session.picking_type_code, checked_quality, correct_state_of_product, bad_quality_description, Session.line.product_id.id, 
                        Session.line.failed_expiration, Session.line.overdue_days, Session.line.reason_quality],
                    })
                    .then(function (line) {
                        $('body').removeClass('modal-open');
                        $('.modal-backdrop').remove();
                        core.bus.off('barcode_scanned', self, self._onBarcodeScanned);
                        Session.lot_id = undefined;
                        if (Session.picking) {
                            console.log("session picking")
                            self.do_action({
                                type: 'ir.actions.client',
                                name: _t('Validate Picking'),
                                tag: 'validate_wh_ops',
                                target: 'fullscreen',
                            }, {clear_breadcrumbs: true}); 
                        }
                        else if (Session.pickings) {
                            console.log("session pickings")
                            self.do_action({
                                type: 'ir.actions.client',
                                name: _t('Validate Multiple Picking'),
                                tag: 'multiple_validate_wh_ops',
                                target: 'fullscreen',
                            }, {clear_breadcrumbs: true}); 
                        }

                        //window.history.back();
                    });
                }
            },
            "click .divide": function(e) {
                var checked_quality = Session.line.quality_check;
                var correct_state_of_product = Session.line.correct_state_of_product;
                var bad_quality_description = $('.bad_quality_description').val();
                var self = this;
                console.log("Line id ",parseInt(Session.line['id']));
                this._rpc({
                    model: 'stock.move.line',
                    method: 'create_move_line',
                    args: [[parseInt(Session.line['id'])], self.parseQuantity($(".done").val()), parseInt($('.selected_lot').attr('id')), $('.selected_lot').html(),
                    Session.picking_type_code, checked_quality, correct_state_of_product, bad_quality_description, Session.line.product_id.id, 
                    Session.line.failed_expiration, Session.line.overdue_days, Session.line.reason_quality],
                })
                .then(function (line) {
                    $("#modal").modal('toggle');
                    $('body').removeClass('modal-open');
                    $('.modal-backdrop').remove();
                    core.bus.off('barcode_scanned', self, self._onBarcodeScanned);
                    Session.lot_id = undefined;
                    if (Session.picking) {
                        console.log("session picking")
                        self.do_action({
                            type: 'ir.actions.client',
                            name: _t('Validate Picking'),
                            tag: 'validate_wh_ops',
                            target: 'fullscreen',
                        }, {clear_breadcrumbs: true}); 
                    }
                    else if (Session.pickings) {
                        console.log("session pickings")
                        self.do_action({
                            type: 'ir.actions.client',
                            name: _t('Validate Multiple Picking'),
                            tag: 'multiple_validate_wh_ops',
                            target: 'fullscreen',
                        }, {clear_breadcrumbs: true}); 
                    }
                    //window.history.back();
                });
            },
            "click .back": function() {
                var self = this;
                Session.lot_id = undefined;
                console.log("Back picking ",Session.picking)
                console.log("Back pickings ",Session.pickings)
                if (Session.picking) {
                    console.log("session picking")
                    self.do_action({
                        type: 'ir.actions.client',
                        name: _t('Validate Picking'),
                        tag: 'validate_wh_ops',
                        target: 'fullscreen',
                    }, {clear_breadcrumbs: true}); 
                }
                else if (Session.pickings) {
                    console.log("session pickings")
                    self.do_action({
                        type: 'ir.actions.client',
                        name: _t('Validate Multiple Picking'),
                        tag: 'multiple_validate_wh_ops',
                        target: 'fullscreen',
                    }, {clear_breadcrumbs: true}); 
                }

                //window.history.back();
            },
            /*"change .selected_lot": function(e) {
               console.log("Change");
               console.log("VAL ",$('.selected_lot option:selected').val());
               console.log("HTML ",$('.selected_lot option:selected').html());
            },*/
            "click .selected_lot": function(e) {
                var self = this;
                e.preventDefault();
                var m = new Date();
                var dateString =
                    m.getUTCFullYear() + "-" +
                    ("0" + (m.getUTCMonth()+1)).slice(-2) + "-"+
                    ("0" + m.getUTCDate()).slice(-2) + " " +
                    ("0" + m.getUTCHours()).slice(-2) + ":" +
                    ("0" + m.getUTCMinutes()).slice(-2) + ":" +
                    ("0" + m.getUTCSeconds()).slice(-2);
                console.log("Today tine ",dateString)
                var domain = [['product_id','=',self.line.product_id['id']],['expiration_date','>',dateString]];
                this.do_action('inventory_log.only_view_lot_kanban_action',{
                    additional_context: {
                        domain: domain,
                    },/*
                    clear_breadcrumbs: true*/
                });
            },
            "keypress #done_integer_input": function(e) {
                return e.charCode >= 48 && e.charCode <= 57
            },
            "keypress #done_float_input": function(e) {
                return (e.charCode >= 48 && e.charCode <= 57) || e.charCode == 46
            },
        },
        start: async function () {
            
            var self = this;
            var done = 0;
            this._super();
            Session.current_model = "stock.move.line";
            console.log("Session.lot_id ",Session.lot_id)
            this._rpc({
                model:  Session.current_model,
                method: 'read_with_lot',
                args: [[parseInt(self.line_id)],Session.lot_id],
            })
            .then(function (line) {
                console.log("----------------read_with_lot-----------------")
                self.line = line[0];
                var not_read = true;
                var create_lot = false;
                console.log('line res', line)
                console.log("Self line ",self.line)
                console.log("aqui---------------")
                Session.line = self.line;
                console.log("Code lote ",self.codes)
                if (self.codes.qty) {
                    done = self.codes.qty;
                }
                if (self.codes.lote) {
                    var existent_lot = false;
                    self.line.lot_ids.forEach(function(l) {
                        console.log("Buscando lote")
                        if (l.name === self.codes.lote) {
                            existent_lot = { name: l.name, id: l.id, expiration_date: l.expiration_date};
                            console.log("lot", l)
                            console.log("encuentra lote ",existent_lot)
                        }
                    });
                    if (!existent_lot && Session.picking_type_code === 'incoming') {
                        console.log("No existe lote")
                        var expiration_date = false;
                        if (self.codes.expiration_date) {
                            var date_string = self.codes.expiration_date.toString()
                            //var new_date = "20"+date_string.substring(0,2)+'-'+date_string.substring(2,4)+'-'+date_string.substring(4,6);
                            expiration_date = date_string;
                            $("#expiration_date").val(expiration_date)
                        }
                        console.log("Abriendo modal")
                        create_lot = true;
                        /*core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                        self.$el.html( QWeb.render("ShowMoveLine", {line: self.line, options: self.conf,type:Session.picking_type_code, done:done,not_read: not_read}));    
                        $("#expiration_date").val(expiration_date)
                        $(".lot_name").val(self.codes['lote'])
                        $("#myModal").modal('toggle');*/
                    }
                    else if (existent_lot) {
                        console.log("existe lote")
                        $('body').removeClass('modal-open');
                        $('.modal-backdrop').remove();
                        self.line.current_lot = existent_lot;
                         
                    }
                    else {
                        console.log("else")
                        $('body').removeClass('modal-open');
                        $('.modal-backdrop').remove();
                        Session.line = self.line;
                    }
                }
                else {
                    console.log("Not read")
                    not_read = false;
                    Session.line = self.line;
                    if (self.line.lot_id  && !self.line.current_lot) {
                        self.line.current_lot = {
                            'id': self.line.lot_id.id,
                            'name': self.line.lot_id.name,
                            'expiration_date': self.line.lot_id.expiration_date
                        };
                    }
                }
                if (!self.line.current_lot) {
                    console.log("No existe lote se pone vacío")
                    self.line.current_lot = {
                        'id': -1,
                        'name': "",
                        'expiration_date':""
                    }; 
                    /*if (self.line.lot_ids.length > 0) {
                        self.line.current_lot = {
                            'id': self.line.lot_ids[0].id,
                            'name': self.line.lot_ids[0].name,
                            'expiration_date':self.line.lot_ids[0].expiration_date
                        }; 
                    }
                    else {
                        self.line.current_lot = {
                            'id': -1,
                            'name': "",
                            'expiration_date':""
                        }; 
                    }*/
                }
                //Check quality
                var message = ""
                var quality_check = true
                var failed_expiration = false
                var overdue_days = 0
                if (Session.company_settings.quality_control_group && Session.line.product_tracking == 'lot' && self.line.product_id['expiration_time'] != 0)
                    if (self.line.current_lot && self.line.current_lot.expiration_date) {
                        var lot_date = new Date(self.line.current_lot.expiration_date.split(' ')[0]);
                        var today = new Date();
                        var dd = String(today.getDate()).padStart(2, '0');
                        var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
                        var yyyy = today.getFullYear();
                        today = yyyy+'-'+mm+'-'+dd;
                        console.log("Today ",today)
                        var todayDate = new Date(today);
                        console.log("lot_date ",lot_date)
                        console.log("todayDate ",todayDate)
                        var diffTime = Math.abs(todayDate - lot_date);
                        var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                        var productLifeTime = self.line.product_id['expiration_time']
                        var productDays = new Date(todayDate.getTime()+(productLifeTime * 24 * 60 * 60 * 1000));
                        if (lot_date <= todayDate) {
                            console.log("Menor");
                            failed_expiration = true
                            overdue_days = Math.abs(Math.ceil((productDays - lot_date) / (1000 * 60 * 60 * 24)))
                            quality_check = false
                            message = "There is not enough life date" 
                        }
                        else {
                            console.log(" diff days", diffDays );
                            if (diffDays < self.line.product_id['expiration_time']) {
                                failed_expiration = true
                                overdue_days = Math.abs(Math.ceil((productDays - lot_date) / (1000 * 60 * 60 * 24)))
                                quality_check = false
                                message = "There is not enough life date"
                            } 
                        }
                    } else if (self.line.current_lot && !self.line.current_lot.expiration_date) {
                        console.log("There is no life date")
                        failed_expiration = true
                        quality_check = false
                        message = "There is no life date" 
                    }
                self.updateQualityCheckRelatedParams(self, failed_expiration, overdue_days, self.line.correct_state_of_product, quality_check, message)
                $('body').removeClass('modal-open');
                $('.modal-backdrop').remove();
                core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                self.$el.html( QWeb.render("ShowMoveLine", {line: self.line, options: self.conf,type:Session.picking_type_code, done:done,not_read: not_read, is_in_group:Session.company_settings.quality_control_group}));    
                if (create_lot) {
                    console.log("abriendo modal 2")
                    $("#expiration_date").val(expiration_date)
                    $(".lot_name").val(self.codes['lote'])
                    $("#myModal").modal('toggle')
                }
                $(".bad_quality_description_div").hide();
                console.log("----------------end-----------------")
            });
            
        },
        init: function(parent, action) {
            var self = this;
            this._super.apply(this, arguments);
            this.line_id = action.move_line_id || false;
            Session.line_id = this.line_id;
            this.codes = action.codes || false;
        },
        _onBarcodeScanned: function(barcode) {
            var existent_lot = false;
            var self = this;
            alert(barcode)
            var move_line_id = false;
            barcode = barcode.replace(/[^A-Za-z0-9\-\/\.]/g,'')
            core.bus.off('barcode_scanned', this, this._onBarcodeScanned);
            var codes = self.parseBarcode(barcode)
            var found = false;

            if (Session.picking) {
                Session.barcodes.forEach(function(l) {
                    if (parseInt(l.product_id) === codes['product_id']) {
                        if (!found) {
                            found = l.line;
                        }
                        if (codes['lote'] && codes['lote'] === l.lot) {
                            found = l.line;
                        }
                    }
                });
            }
            else if (Session.pickings) {
                for (const key in Session.barcodes) {
                    if (parseInt(Session.barcodes[key].product_id) === codes['product_id']) {
                        if (!found) {
                            found = Session.barcodes[key].line;
                        }
                        if (codes['lote'] && codes['lote'] === Session.barcodes[key].lot) {
                            found = Session.barcodes[key].line;
                        }
                    }
                }; 
            }
            if (found) {
                move_line_id = found
                console.log("if")
                if (move_line_id) {
                    self.do_action({
                        type: 'ir.actions.client',
                        name: _t('Move Line'),
                        tag: 'move_line',
                        target: 'fullscreen',
                        move_line_id: move_line_id,
                        codes: codes
                    }, {clear_breadcrumbs: true}); 
                }
                else {
                    alert(_t("Barcode don't match any product in line"));
                    core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                }
            }
            else if (codes['lote']) {
                console.log("no hay producto pero si lote ",codes.lote);
                Session.line.lot_ids.forEach(function(l) {
                    console.log("l ", l)
                    if (l.name === codes.lote) {
                        existent_lot = {name:l.name,id:l.id};
                        self.line.current_lot = existent_lot; 
                        core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                        self.$el.html( QWeb.render("ShowMoveLine", {line: self.line, options: self.conf,type:Session.picking_type_code, is_in_group:Session.company_settings.quality_control_group}));
                    }
                });

            }
            else {
                alert(_t("Barcode don't match any product in line"));
                core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
            }
        },
        parseBarcode: function(barcode) {
            console.log("parsebarcode ")
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
            
                if (barcode.search(/37\d{3}$/) != -1) {
                    var lqty = barcode.substring(barcode.length - 3, barcode.length)
                    barcode = barcode.substring(0, barcode.length - 5)
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
                product_id = String(barcode.match(/02(\d{14})/)['0']);
                barcode = barcode.replace(product_id,'')
                product_id = String(product_id).substring(2);
                console.log('product_id', product_id);
                }
                
                ia_37 = barcode.includes('37')
                if (ia_37){
                qty = String(barcode.match(/37(\d{1,8})/)['0']);
                barcode = barcode.replace(qty,'')
                qty = String(qty).substring(2);
                
                console.log('Qty', qty);
                }
  
                ia_15 = barcode.includes('15')
                if (ia_15){
                  
                expiration_date = String(barcode.match(/15(\d{6})/));
                let index_15 = barcode.indexOf('15')
                expiration_date = barcode.substring(index_15, index_15 + 8);
                  console.log('Expiration Date', expiration_date);
                barcode = barcode.replace(expiration_date, '')
                expiration_date = String(expiration_date).substring(2);
                console.log('Expiration Date', expiration_date);
                  console.log('barcode', barcode);
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
                    if (IA === '01' || IA === '02' || IA === '37'  || IA === '10'|| IA === '17'|| IA === '15') {
                        let tempCode = barcode.substring(endIndex, startIndex + codeSize)
                        if (tempCode.search(' ') != -1) {
                            let cut = tempCode.indexOf(' ')
                            startIndex = startIndex + cut + 3
                            endIndex = endIndex + cut + 3
                            tempCode = tempCode.substring(0, cut)
                            indexModified = true;
                        }
                        if ( IA === '37'  || IA === '10' ) {
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
                    if (!indexModified) {
                        startIndex += codeSize
                        endIndex = 2 + startIndex
                    }
                    indexModified = false;
    
                        if(qty != '' && lote != '')
                            exists = false
                    }
                }
            }
            
            return {'qty': parseInt(qty), 'lote': lote, 'product_id':  parseInt(product_id), 'expiration_date':expiration_date}
        },
        parseQuantity(stringQty) {
            console.log("PARSE QUANTITY ",Session.line.product_id)
            if (Session.line.product_id.measure_type == 'unit')
                return parseInt(stringQty)
            else {
                let integer = parseInt(stringQty);
                let decimalPointerIndex = stringQty.search(/[,\.]/)
                let decimal = stringQty.substring(decimalPointerIndex + 1, decimalPointerIndex + 4)
                return parseFloat(integer + '.' + decimal.match(/\d+/)[0])
            }
        },
        updateQualityCheckRelatedParams(self, failed_expiration, overdue_days, correct_state_of_product, quality_check, message) {
            self.line.failed_expiration = failed_expiration
            self.line.overdue_days = overdue_days
            self.line.correct_state_of_product = correct_state_of_product
            if (self.line.product_tracking != 'none' && self.line.product_tracking != 'serial' && Session.company_settings.quality_control_group && self.line.product_id.expiration_time != 0) {
                console.log("updateQualityCheckRelatedParams actualiza el quality check")
                self.line.quality_check = quality_check
                self.line.reason_quality = message
            }
            console.log('updateQualityCheckRelatedParams self', self)
        },
    });




    core.action_registry.add('move_line', MoveLine);

    return MoveLine
    
});
