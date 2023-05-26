// START odoo module encapsulation
odoo.define('inventory_log.validate_wh_ops', function (require) {
"use strict";

var AbstractAction = require('web.AbstractAction');
var ajax = require('web.ajax');
var core = require('web.core');
var canvas = require('inventory_log.canvas');

var Session = require('web.session');
var _t = core._t;

var QWeb = core.qweb;

var ValidateWHOps = AbstractAction.extend({
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
        "click .done": function(e) {
            $('#modal2').modal('toggle');
            Session.move_line = $(e.currentTarget).attr('class').split(/line_/)[1].split(' ')[0];
        }, 
        "click .search_barcode": function(e) {
            this._onBarcodeManual()
        },
        "click .temperature_quality": function(e) {
            var self = this;
            if($('.correct_state_van').is(':checked') && $('.temperature_quality').is(':checked')){
                console.log("MARCADO 2")
                !$('.quality_check').prop("checked", self.picking.quality_check);
                if ( self.picking.quality_check )
                    $(".reason_check").hide();
            } else {
                console.log("NO MARCADO 2")
                if($('.quality_check').is(':checked')){
                    !$('.quality_check').prop("checked", false);
                }
                $(".reason_check").show();
            }

        },
        "click .correct_state_van": function(e) {
            var self = this;
            if($('.correct_state_van').is(':checked') && $('.temperature_quality').is(':checked')){
                console.log("MARCADO 2")
                !$('.quality_check').prop("checked", self.picking.quality_check);
                if ( self.picking.quality_check )
                    $(".reason_check").hide();
            } else {
                console.log("NO MARCADO 2")
                if($('.quality_check').is(':checked')){
                    !$('.quality_check').prop("checked", false);
                }
                $(".reason_check").show();
            }

        },
        "click .nav-item": function(e) {
            $('#modal2').modal('hide');
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
        },
        "click .modal_close": function(e) {
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
        },
        "click .undo": function(e) {
            var self = this;
            this._rpc({
                model: 'stock.move.line',
                method: 'erase_done',
                args: [[parseInt(Session.move_line)]],
            })
            .then(function (quality_check) {
                delete Session.lines_done[Session.move_line];
                self.picking.quality_check = quality_check
                console.log("self.picking", self.picking)

                self._rpc({
                    model: 'stock.warehouse',
                    method: 'get_stock_move',
                    args: [Session.picking.id],
                }).then(function(result){
                    $("#modal2").modal('toggle');
                    $('body').removeClass('modal-open');
                    $('.modal-backdrop').remove();
                    Session.line_pick = {}
                    result.stock_move_line.forEach(function(l) {
                        if(l.qty_done != l.product_uom_qty && l.product_uom_qty!=0 && l.qty_done < l.product_uom_qty){
                            Session.line_pick[l.id] = {name:l.product_id[1], product_uom_qty:l.product_uom_qty, quantity_done: l.qty_done,reserved_availability:l.product_uom_qty,lot_id:l.lot_id};
                        }
                    });
                    result.stock_move.forEach(function(l) {
                        if(l.reserved_availability==0){
                            Session.line_pick_not_reserved[l.id] = {name:l.product_id[1], product_uom_qty:l.product_uom_qty, quantity_done: l.qty_done,reserved_availability:l.reserved_availability,lot_id:l.lot_id};   
                        }
                    });
                    self.$el.html(QWeb.render("ValidateWHOpsXML", {picking: self.picking, completed_lines: Session.lines_done , lines: Session.line_pick, dest: Session.dest, respon: Session.respon, zones: self.zones,states: self.states,date: self.picking.scheduled_date.split(' '), options: Session.company_settings, p_type:Session.picking_type_code, is_in_group:Session.company_settings.quality_control_group}));      
                    if ( self.picking.quality_check )
                        $(".reason_check").hide();
                });
          });
        }, 
        "click .go_back_no_save": function(){ 
            Session.line_pick = undefined;
            Session.respon = undefined;
            Session.dest = undefined;  
            var date = false; 
            var self = this;

            $("#exampleModal").modal('toggle');
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
            core.bus.off('barcode_scanned', this, this._onBarcodeScanned);
            if(Session.date){
                date = Session.date
            }
                this.do_action({
                    type: 'ir.actions.client',
                    name: _t('Warehouse Operations'),
                    tag: 'wh_ops',
                    target: 'fullscreen',
                    next_show: Session.picking_type
                }, {clear_breadcrumbs: true}); 
        },
        "click .back": function(e) {
            var self = this;
            var date = false; 
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
            Session.line_pick = undefined;
            Session.respon = undefined;
            Session.dest = undefined; 
            date = false
            core.bus.off('barcode_scanned', this, this._onBarcodeScanned);
            if(Session.date){
                date = Session.date
            }
            if(Session.from_picking_lines){
                Session.from_picking_lines = undefined;
                self.do_action({
                    type: 'ir.actions.client',
                    name: _t('Picking Lines'),
                    tag: 'picking_lines',
                    target: 'fullscreen',
                    date: Session.date,
                    filter: Session.filter,
                    warehouse: Session.warehouse,
                    zones: Session.selected_badges,
                }, {clear_breadcrumbs: true}); 
            }  
            this.do_action({
                type: 'ir.actions.client',
                name: _t('Warehouse Operations'),
                tag: 'wh_ops',
                target: 'fullscreen',
                next_show: Session.picking_type
            }, {clear_breadcrumbs: true}); 
        },
        "click .partner": function(e) {
            e.preventDefault();
            this.do_action('inventory_log.respon_kanban_action',{
                additional_context: {
                    n_action: "inventory_log.validate_wh_ops",
                },
                clear_breadcrumbs: true
            });
        },
        "click .loc": function(e) {
            e.preventDefault();

            this.do_action('inventory_log.location_kanban_action_duwi',{
                additional_context: {
                    type: "dest",
                    n_action: "inventory_log.validate_wh_ops",
                },
                clear_breadcrumbs: true
            });

        },
        "click .to_do": function(e) {
            e.preventDefault();
            this.do_action({
                type: 'ir.actions.client',
                name: _t('Move Line'),
                tag: 'move_line',
                target: 'fullscreen',
                move_line_id: $(e.currentTarget).attr('class').split(/line_/)[1]
            }, {clear_breadcrumbs: true});
        },
        "click .done_confirm": function(e) {
            self._rpc({
                model: 'stock.move.line',
                method: 'unlink',
                args: [parseInt($(e.currentTarget).attr('class').split(/line_/)[1])],
            })
            .then(function () {
                self._reloadAttachmentBox();
                if (self.fields.thread) {
                    self.fields.thread.removeAttachments([ev.data.attachmentId]);
                }
                self.trigger_up('reload');
            });
        },

        "click .save_changes": function() {
            var self = this;
            self.scheduled_date = $('#start').val()+' '+$('#appt').val()
            self.zone_id = parseInt($("#selected_zone").val());
            if($(".temperature").val()){
                Session.deliver_temperature =  $(".temperature").val().replace(',','.');
            }
            this._rpc({
                model: 'stock.picking',
                method: 'write',
                args: [self.picking.id, {scheduled_date: self.scheduled_date,
                delivery_zone_id: self.zone_id, deliver_temperature: Session.deliver_temperature}],
            });
        },
        "click .cancel_r": function() {
            var self = this;
            console.log("PIICK ID self.picking ",self.picking)
            this._rpc({
                model: 'stock.warehouse',
                method: 'do_unreserve_log',
                args: [self.picking.id]
            }).then(function(res){
                console.log("lo cancelo")
                self.start()  
                core.bus.off('barcode_scanned', this, this._onBarcodeScanned);
            });
        },
        "click .validate": function(e) {
            var self = this;
            var msg = ""
            var value = self.check_lines()
            var checked_quality = true;
            var quality_message = false;
            var temperature_quality = false;
            var correct_state_van = false;
            console.log("Value ",value)
            $(".force_validate").prop('disabled', false);

            switch(value){
                case 3:
                    msg += _t("<p>You have processed more than what was initially planned. Are you sure you want to validate the picking?</p><br/>");
                    msg += _t("<p>You have processed less than what was initially planned.</p><br/><div class='form-check'><input class='form-check-input' type='checkbox' onclick=document.getElementById('b_order').setAttribute('value',document.getElementById('b_order').value*-1) value='-1' id='b_order'/><label class='form-check-label' for='flexCheckDefault'>Create BackOrder</label></div>");
                    break;
                case 2:
                    msg += _t("<p>You have processed less than what was initially planned.</p><br/><div class='form-check'><input class='form-check-input' type='checkbox' onclick=document.getElementById('b_order').setAttribute('value',document.getElementById('b_order').value*-1) value='-1' id='b_order'/><label class='form-check-label' for='flexCheckDefault'>Create BackOrder</label></div>");
                    break;
                case 1:
                    msg += _t("<p>You have processed more than what was initially planned. Are you sure you want to validate the picking?</p>");
                    break;
            }
            if (value != 0){
                $(".modal-title").html(_t("Warning"));
                $(".modal-body").html(msg);
                $(".modal").modal('show')
                return;
            }
            if (Session.respon || self.picking.picking_type_code == 'outgoing'  && Session.company_settings.signature){
                $("#GenericModalTitle").html(_t("Signature"));
                var html = "";
                html +=    "<div class='o_canvas_container'>";
                html += _t("<canvas id='myCanvas' class='o_signature_canvas'> Canvas not supported</canvas>");
                html +=    "<input name='signature' id='signature' type='hidden'/>";
                html +=    "<div class='o_canvas_clear_button_container'>";
                html += _t("<button id='clear' class='btn btn-primary'>Clear</button><br/>");
                html +=    "</div></div>";
                $("#GenericModalBody").html(html);
                $(".force_validate").prop('disabled', true);
                $("#GenericModal").modal('show');
                this.canvas.canvas_html_element($('#myCanvas'));
                this.canvas.clear_html_clickable_element($('#clear'));
    
                this.canvas.myCanvas.bind('mouseup', function(e) {
                    if(!self.canvas.its_signed) {
                        self.canvas.its_signed = true;
                        // let sig_64 = self.canvas.myCanvas[0].toDataURL();
                        // self.image_canvas = sig_64.split(',')[1]; 
                        $(".force_validate").prop('disabled', false);
                        // $('.modal_body_fotter').html(QWeb.render("SignatureModalFotter", {widget: self, from:from})); 
                    }
                });
                this.canvas.$clear.bind('click', function(e) {
                    if(self.canvas.its_signed) {
                        self.canvas.its_signed = false;
                        $(".force_validate").prop('disabled', true);
                        // $('.modal_body_fotter').html(QWeb.render("SignatureModalFotter", {widget: self, from:from}));
                    }
                });
                
                return;
            }
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
            console.log('validar', self)

            if(!$('.quality_check').is(':checked')){
                checked_quality = false;
                if($('.reason_state').val()){
                    console.log("Reason1 ",$('.reason_state').val());
                    quality_message = $('.reason_state').val();
                }
            }
            if($('.temperature_quality').is(':checked')){
                temperature_quality = true;
            }
            if($('.correct_state_van').is(':checked')){
                correct_state_van = true;
            }
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
            Session.scheduled_date = $('#start').val()+' '+$('#appt').val();
            Session.delivery_zone_id = false;
            if($("#selected_zone").val()){
                Session.delivery_zone_id = parseInt($("#selected_zone").val());
             }
            Session.deliver_temperature =  false;
            if($(".temperature").val()){
                Session.deliver_temperature =  $(".temperature").val().replace(',','.');
            }
            this._rpc({
                model: 'stock.warehouse',
                method: 'validate_picking',
                args: [self.picking.id, Session.line_pick, false, Session.dest,,
                    ,Session.scheduled_date,Session.delivery_zone_id,Session.deliver_temperature,
                    checked_quality,quality_message,temperature_quality,correct_state_van, Session.uid
                ],
            }).then(function(res){
                Session.line_pick = undefined;
                Session.dest = undefined;   
                core.bus.off('barcode_scanned', self, self._onBarcodeScanned);
                /*if(Session.date){
                    date = Session.date
                } */
                self.do_action({
                    type: 'ir.actions.client',
                    name: _t('Warehouse Operations'),
                    tag: 'wh_ops',
                    target: 'fullscreen',
                    next_show: Session.picking_type
                }, {clear_breadcrumbs: true}); 
            });
        },
        "click .force_validate": function(e) {
            var self = this;
            var msg = ""
            var value = self.check_lines()
            var date = false;
            var checked_quality = true;
            var quality_message = false;
            var temperature_quality = false;
            var correct_state_van = false;
            if (typeof(self.b_order) == undefined)
                self.b_order = false;
            if (value == 2 || value == 3){
                if ($("#b_order").val())
                    self.b_order = $("#b_order").val();
            } else self.b_order = false;

            if ((Session.respon || self.picking.picking_type_code == 'outgoing') && self.canvas && !self.canvas.its_signed  && Session.company_settings.signature){
                console.log("EEEEEY 1");
                $(".modal-title").html(_t("Signature"));
                var html = "";
                html +=    "<div class='o_canvas_container'>";
                html += _t("<canvas id='myCanvas' class='o_signature_canvas'> Canvas not supported</canvas>");
                html +=    "<input name='signature' id='signature' type='hidden'/>";
                html +=    "<div class='o_canvas_clear_button_container'>";
                html += _t("<button id='clear' class='btn btn-primary'>Clear</button><br/>");
                html +=    "</div></div>";
                $(".modal-body").html(html);
                $(".modal").modal('show');
                $(".force_validate").prop('disabled', true);
                this.canvas.canvas_html_element($('#myCanvas'));
                this.canvas.clear_html_clickable_element($('#clear'));

                this.canvas.myCanvas.bind('mouseup', function(e) {
                    if(!self.canvas.its_signed) {
                        self.canvas.its_signed = true;
                        // let sig_64 = self.canvas.myCanvas[0].toDataURL();
                        // self.image_canvas = sig_64.split(',')[1]; 
                        $(".force_validate").prop('disabled', false);
                        // $('.modal_body_fotter').html(QWeb.render("SignatureModalFotter", {widget: self, from:from})); 
                    }
                });
                this.canvas.$clear.bind('click', function(e) {
                    if(self.canvas.its_signed) {
                        self.canvas.its_signed = false;
                        $(".force_validate").prop('disabled', true);
                        // $('.modal_body_fotter').html(QWeb.render("SignatureModalFotter", {widget: self, from:from}));
                    }
                });
                
                return;
            }
            if(!$('.quality_check').is(':checked')){
                checked_quality = false;
                if($('.reason_state').val()){
                    console.log("Reason2 ",$('.reason_state').val());
                    quality_message = $('.reason_state').val();
                }
            }
            if($('.temperature_quality').is(':checked')){
                temperature_quality = true;
            }
            if($('.correct_state_van').is(':checked')){
                correct_state_van = true;
            }
            var sig_64 = false;
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
            if (Session.respon || self.picking.picking_type_code == 'outgoing' && Session.company_settings.signature){
                sig_64 = this.canvas.myCanvas[0].toDataURL();
                sig_64 = sig_64.split(',')[1]
            }
            Session.scheduled_date = $('#start').val()+' '+$('#appt').val();
            Session.delivery_zone_id = false;
            if($("#selected_zone").val()){
                Session.delivery_zone_id = parseInt($("#selected_zone").val());
             }
            Session.deliver_temperature =  false;
            if($(".temperature").val()){
                Session.deliver_temperature =  $(".temperature").val().replace(',','.');
            }
            console.log("goint to validate")
            console.log("quality_message2 ",$('.reason_state').val())
            this._rpc({
                model: 'stock.warehouse',
                method: 'validate_picking',
                args: [self.picking.id, Session.line_pick, self.b_order, Session.dest, Session.respon && Session.respon.id || false, sig_64
                    ,Session.scheduled_date,Session.delivery_zone_id,Session.deliver_temperature,
                    checked_quality,quality_message,temperature_quality,correct_state_van, Session.uid]
            }).then(function(res){
                console.log("RES ",res)
                Session.line_pick = undefined;   
                Session.dest = undefined;   
                Session.respon = undefined;
                core.bus.off('barcode_scanned', self, self._onBarcodeScanned);
                if(Session.date){
                    date = Session.date
                }  
                self.do_action({
                    type: 'ir.actions.client',
                    name: _t('Warehouse Operations'),
                    tag: 'wh_ops',
                    target: 'fullscreen',
                    next_show: Session.picking_type
                }, {clear_breadcrumbs: true}); 
            });
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
        },
        "click .duplicate": function(e) {
            var self = this;
            e.preventDefault();
            Session.line_pick[Session.counter--] = Session.line_pick[$(e.currentTarget).parent().attr('id')]
            self.$el.html( QWeb.render("ValidateWHOpsXML", {picking: self.picking, lines: Session.line_pick, dest: Session.dest, respon: Session.respon, zones: self.zones,states: self.states,date: self.picking.scheduled_date.split(' '), options: Session.company_settings, p_type:Session.picking_type_code, is_in_group:Session.company_settings.quality_control_group}));
            if ( self.picking.quality_check )
                $(".reason_check").hide();
        },
        "click .prod": function(e) {
            e.preventDefault();
        },
        "click .confirm_create_lot": function(e) {
            var self = this;
            e.preventDefault();
            this._rpc({
                model: 'stock.move',
                method: 'create_new_lot',
                args: [Session.current_line,$(".lot_name").val()],
            }).then(function(res){
                Session.line_pick[Session.current_line].lot_ids.push(res)
                Session.line_pick[Session.current_line].current_lot = res
                $("#myModal").modal('toggle');
                Session.current_line = undefined;
                self.$el.html( QWeb.render("ValidateWHOpsXML", {picking: self.picking, lines: Session.line_pick, dest: Session.dest, respon: Session.respon, zones: self.zones,states: self.states,date: self.picking.scheduled_date.split(' '),  options: Session.company_settings, p_type:Session.picking_type_code, is_in_group:Session.company_settings.quality_control_group}));
                if ( self.picking.quality_check )
                    $(".reason_check").hide();
            });
        },
        "click .create_lot": function(e) {
            Session.current_line = $(e.currentTarget).parent().parent().attr('id')
            e.preventDefault();
            this._rpc({
                model: 'stock.move',
                method: 'get_sequence',
                args: [],
            }).then(function(res){
                $(".lot_name").val(res)
                $("#myModal").modal('toggle');
            });

        },
        "change .qty_done": function(e){
            var line_id = $(e.currentTarget).parent().attr('class').split(/line_/)[1];
            Session.line_pick[line_id].quantity_done = parseFloat($(e.currentTarget).val());
        },
        "click .check-availability": function(e) {
            var self = this;
            e.preventDefault();
            this._rpc({
                model: 'stock.picking',
                method: 'action_assign_kanban',
                args: [Session.picking.id],
            }).then(function(result){
                console.log('action_assign_kanban', result)
                if (result == 'assigned') {
                    Session.picking = {"id": Session.picking.id};
                    self.do_action("inventory_log.validate_wh_ops");
                } else {
                    $('#StateWarning').modal('show');
                }
                
            });
        },
        "click .view_picking_picture": function(e) {
            e.preventDefault();
            Session.take_pic = false
            this.do_action({
                type: 'ir.actions.client',
                name: _t('Picking Picture'),
                tag: 'picking_picture',
                target: 'fullscreen',
            }, {clear_breadcrumbs: true});
        },
        "click .take_picking_picture": function(e) {
            e.preventDefault();
            Session.take_pic = true
            this.do_action({
                type: 'ir.actions.client',
                name: _t('Picking Picture'),
                tag: 'picking_picture',
                target: 'fullscreen',
            }, {clear_breadcrumbs: true});
        },
    },
    start: async function () {
        this._super();
        console.log("asd")
        Session.counter = -1;
        Session.in_group = false
        var self = this;
        if (!Session.picking) {
            this.do_action('inventory_log.main_screen',{
                    clear_breadcrumbs: true
                });
            return;
        }
        console.log("CONSOLE LOG 1");
        if (!Session.line_pick){
            console.log("CONSOLE LOG 2");
            Session.line_pick = {};
        }
        this.canvas = new canvas();
        console.log("Canvas ",this.canvas)
        this._rpc({
                model: 'stock.warehouse',
                method: 'get_picking',
                args: [Session.picking.id,Session.location_id,Session.picking_type],
            }).then(function(result){
                if (result.picking.length > 0){
                    console.log("Result picking ",result.picking)
                    self.picking = result.picking[0];
                    self.scheduled_date = self.picking.scheduled_date;
                    self.zone_id = self.picking.delivery_zone_id[0];
                    self.zones = result.zones;
                    self.states = result.states;
                    if ( self.picking.quality_check )
                        $(".reason_check").hide();
                }

                else {
                    console.log("Doing acitonsss ")
                    self.do_action({
                        type: 'ir.actions.client',
                        name: _t('Warehouse Operations'),
                        tag: 'wh_ops',
                        target: 'fullscreen',
                    }, {clear_breadcrumbs: true}); 
                }
                console.log("Session barcodes ",result.barcodes)
                self.type = self.picking.picking_type_code;
                Session.picking_type_code = self.type;
                Session.barcodes = result.barcodes
                Session.line_pick = {}
                Session.lines_done = {}
                Session.line_pick_not_reserved = {}
                /*result.stock_move.forEach(function(l) {
                    if(l.quantity_done != l.product_uom_qty){
                        Session.line_pick[l.id] = {name:l.product_id[1], product_uom_qty:l.product_uom_qty, quantity_done: l.quantity_done,reserved_availability:l.reserved_availability};
                    }
                });*/
                console.log("Result lines ",result.stock_move_line)
                result.stock_move_line.forEach(function(l) {
                    if(l.qty_done != l.product_uom_qty && l.product_uom_qty!=0 && l.qty_done < l.product_uom_qty){
                        Session.line_pick[l.id] = {name:l.product_id[1], product_uom_qty:l.product_uom_qty, quantity_done: l.qty_done,reserved_availability:l.product_uom_qty,lot_id:l.lot_id, expired: l.expired};
                    }
                    if(l.qty_done > 0){
                        Session.lines_done[l.id] = {name:l.product_id[1], product_uom_qty:l.product_uom_qty, quantity_done: l.qty_done,lot_id:l.lot_id, expired: l.expired};
                    }
                });
                console.log("Session lines pick ",Session.line_pick)
                console.log("Session lines done ",Session.lines_done)
                console.log("Result lines ",result.stock_move)
                result.stock_move.forEach(function(l) {
                    if(l.reserved_availability==0){
                        Session.line_pick_not_reserved[l.id] = {name:l.product_id[1], quantity_done: l.quantity_done,reserved_availability:l.reserved_availability,lot_id:l.lot_id};   
                    }
                });
                console.log("line_pick_not_reserved ",Session.line_pick_not_reserved)
                core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                self.$el.html( QWeb.render("ValidateWHOpsXML", {picking: self.picking, completed_lines: Session.lines_done , lines: Session.line_pick, dest: Session.dest, respon: Session.respon, zones: self.zones,states: self.states,date: self.picking.scheduled_date.split(' '), options: Session.company_settings, p_type: Session.picking_type_code, is_in_group:Session.company_settings.quality_control_group}));
                console.log("self.picking ",self.picking)
                if(self.picking.quality_check){
                    $(".reason_check").hide();
                }
            });
    },
    check_lines: function() {
        var result = 0;
        // 0 = All Rigth
        // 1 = Product Excess 
        // 2 = Less Product than expected (BackOrder?)
        // 3 = All of before

        Object.keys(Session.line_pick).forEach(function(k){
            if (result == 3) return;

            if (Session.line_pick[k].reserved_availability > Session.line_pick[k].quantity_done && result != 2)
                result += 2;
            if (Session.line_pick[k].reserved_availability < Session.line_pick[k].quantity_done && result != 1)
                result += 1;
        });
        if (Object.keys(Session.line_pick_not_reserved).length > 0 && result != 2){
            console.log("NO hay reserva")
            result += 2;
        }
        return result;
    },
    _onBarcodeManual: function() {
        var self = this;
        var barcode = $("#code").html();
        var codes = self.parseBarcode(barcode)
        var move_line_id = false;
        var found = false;

        Session.barcodes.forEach(function(l) {
            if(parseInt(l.product_id) === codes['product_id']){
                if(!found){
                    found = l.line;
                }
                if(codes['lote'] && codes['lote'] === l.lot){
                    found = l.line;
                }
            }
        });
        if (found) {
            move_line_id = found
            if(move_line_id){
                self.do_action({
                    type: 'ir.actions.client',
                    name: _t('Move Line'),
                    tag: 'move_line',
                    target: 'fullscreen',
                    move_line_id: move_line_id,
                    codes: codes
                }, {clear_breadcrumbs: true}); 
            }
            else{
                alert(_t("Barcode don't match any product in line"));
                core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
            }
        }
        else{
            alert(_t("Barcode don't match any product in line"));
            core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
        }
    },
    _onBarcodeScanned: async function(barcode) {
        var self = this;
        alert(barcode)
        barcode = barcode.replace(/[^A-Za-z0-9\-\/\.]/g,'')
        var org_barcode = barcode
        core.bus.off('barcode_scanned', this, this._onBarcodeScanned);
        //var codes = await self.parseBarcode(barcode)
        const regexp = /(01|10|15|17|37|91)/g;
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
        let lastIA = ''
        var move_line_id = false;

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
        if (barcode.search(regexp) != -1){ 
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
            }else
            {
                while (exists && startIndex < barcode.length) {
                    IA = barcode.substring(startIndex, endIndex);
                    if (IA === '' || !(IA in dictIA)) {
                        exists = false
                    } else {
                        let codeSize = dictIA[IA];
                        if (IA === '01' || IA === '02' || IA === '37'  || IA === '10' || IA === '15'|| IA === '17') {
                            let tempCode = barcode.substring(endIndex, startIndex + codeSize)
                            console.log('tempCode' , tempCode)
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
                                case '91':
                                    proveedor = tempCode
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
        }
            var not_again = false
            var codes = {'qty': parseInt(qty), 'lote': lote, 'product_id':  parseInt(product_id), 'expiration_date':expiration_date}
            if(expiration_date){
                var date_string = codes['expiration_date'].toString()
                console.log("COOOOOODES ",codes)
                not_again = true
                codes['expiration_date'] = "20"+date_string.substring(0,2)+'-'+date_string.substring(2,4)+'-'+date_string.substring(4,6);
            }
            console.log("AGAIN ",not_again)

            console.log("ANTES DEL IFFFFFF ",codes)
            if (!not_again){
                console.log("Barcode 2-------- ",org_barcode)
                let qty = "";
                let lote = "";
                let product_id = "";
                let proveedor = "";
                var expiration_date = "";
                var codes = {}
                var found = false;
                console.log("HOLAAAAAA ",org_barcode)
                this._rpc({
                    model: 'wiz.stock.barcodes.read',
                    method: 'process_barcode_gs1_inherited',
                    args: [org_barcode],
                }).then(function(res){
                    console.log("RESSSS ttttb ",res)
                    for (const [key, value] of Object.entries(res)) {
                        switch(key) {
                            case '01':
                                product_id = value
                                break
                            case '02':
                                product_id = value
                                break
                            case '10':
                                lote = value
                                break
                            case '17':
                                expiration_date = value
                                break
                            case '15':
                                expiration_date = value
                                break
                            case '37':
                                qty = value
                                break
                            case '91':
                                proveedor = value
                                break
                            }
                        }
                        codes = {'qty': parseInt(qty), 'lote': lote, 'product_id':  parseInt(product_id), 'expiration_date':expiration_date}
                        console.log("Codes before ",codes)
                        Session.barcodes.forEach(function(l) {
                            if(parseInt(l.product_id) === codes['product_id']){
                                if(!found){
                                    found = l.line;
                                }
                                if(codes['lote'] && codes['lote'] === l.lot){
                                    found = l.line;
                                }
                            }
                        });
                        console.log("Found codes ",codes);
                        console.log("Fouund ",found)
                        if (found) {
                            move_line_id = found
                            console.log("MOve line ",move_line_id)
                            if(move_line_id){
                                self.do_action({
                                    type: 'ir.actions.client',
                                    name: _t('Move Line'),
                                    tag: 'move_line',
                                    target: 'fullscreen',
                                    move_line_id: move_line_id,
                                    codes: codes
                                }, {clear_breadcrumbs: true}); 
                            }
                            else{
                                alert(_t("Barcode don't match any product in line"));
                                core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                            }
                        }
                        else{
                            alert(_t("Barcode don't match any product in line"));
                            core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                        }    
                    })
                    
            }
            else{
                var found = false;

                Session.barcodes.forEach(function(l) {
                    if(parseInt(l.product_id) === codes['product_id']){
                        if(!found){
                            found = l.line;
                        }
                        if(codes['lote'] && codes['lote'] === l.lot){
                            found = l.line;
                        }
                    }
                });
                console.log("Found")
                if (found) {
                    move_line_id = found
                    console.log("MOve line ",move_line_id)
                    if(move_line_id){
                        self.do_action({
                            type: 'ir.actions.client',
                            name: _t('Move Line'),
                            tag: 'move_line',
                            target: 'fullscreen',
                            move_line_id: move_line_id,
                            codes: codes
                        }, {clear_breadcrumbs: true}); 
                    }
                    else{
                        alert(_t("Barcode don't match any product in line"));
                        core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                    }
                }
                else{
                    alert(_t("Barcode don't match any product in line"));
                    core.bus.on('barcode_scanned', self, self._onBarcodeScanned);
                }
            }

    },
    parseBarcode: async function(barcode) {
        console.log("Barcode-------- ",barcode)
        let qty = "";
        let lote = "";
        let product_id = "";
        let proveedor = "";
        var expiration_date = "";
        this._rpc({
            model: 'wiz.stock.barcodes.read',
            method: 'process_barcode_gs1_inherited',
            args: [barcode],
        }).then(function(res){
            console.log("RESSSS ",res)
            for (const [key, value] of Object.entries(res)) {
                switch(key) {
                case '01':
                    product_id = value
                    break
                case '02':
                    product_id = value
                    break
                case '10':
                    lote = value
                    break
                case '17':
                    expiration_date = value
                    break
                case '15':
                    expiration_date = value
                    break
                case '37':
                    qty = value
                    break
                case '91':
                    proveedor = value
                    break
                }
            }
            var a = {'qty': parseInt(qty), 'lote': lote, 'product_id':  parseInt(product_id), 'expiration_date':expiration_date}
            return a
        })       
    },
});

core.action_registry.add('validate_wh_ops', ValidateWHOps);

return ValidateWHOps

});
// END Odoo module encapsulation
