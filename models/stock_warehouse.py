# -*- coding: utf-8 -*-

from email import message
from odoo import models, fields, api, _
from odoo.tools import groupby
from operator import itemgetter
import pytz
from datetime import datetime
import logging
_logger = logging.getLogger(__name__)

class Warehouse(models.Model):
    _inherit = 'stock.warehouse'

    '''
    Zonas horarias de pytz desactualizadas
    '''
    one_hour_less_tz = ['Africa/Juba', 'America/Campo_Grande', 'America/Cuiaba', 'Pacific/Fiji', 'America/Sao_Paulo', 'Brazil/East', 'Europe/Volgograd']
    one_hour_more_tz = ['America/Dawson', 'America/Whitehorse', 'Canada/Yukon', 'Pacific/Norfolk']
    three_hours_more_tz = ['Antarctica/Casey']

    @api.model
    def prueba_dict(self):
        return dict(self._fields['delivery_steps']._description_selection(self.env))

    @api.model
    def check_barcode_purchases(self, barcode):
        p = self.env['product.product'].search_read(['|','|','|',['barcode', '=', barcode],['barcode', '=', barcode.replace("'","-")],['name', '=', barcode],['name', '=', barcode.replace("'","-")]],['name', 'display_name', 'standard_price'])
        s = self.env['res.partner'].search_read([['supplier_rank','&gt;', 0],'|','|','|',['barcode', '=', barcode],['barcode', '=', barcode.replace("'","-")],['name', '=', barcode],['name', '=', barcode.replace("'","-")]],['display_name'])
        l = self.env['stock.location'].search_read(['|','|','|',['barcode', '=', barcode],['barcode', '=', barcode.replace("'","-")],['name', '=', barcode],['name', '=', barcode.replace("'","-")]],['display_name'])
        w = []
        if (len(l) > 0 and not self.env.user.has_group("inventory_log.group_use_locations")):
            w = self.env['stock.warehouse'].search_read([['lot_stock_id', 'parent_of', l[0]['id']]],['name'])
            l = []

        return {
            'p': p,
            's': s,
            'l': l,
            'w': w,
        }

    @api.model
    def check_barcode_inv(self, barcode,lot_id):
        _logger.info("BARCODE "+str(barcode))
        _logger.info("BARCODE lote  "+str(lot_id))
        p = self.env['product.product'].search_read(['|','|','|',['barcode', '=', barcode],['barcode', '=', barcode.replace("'","-")],['name', '=', barcode],['name', '=', barcode.replace("'","-")]],['name', 'display_name', 'standard_price'],limit=1)
        lot = False
        if lot_id:
            lot_obj =  self.env['stock.production.lot'].sudo().search([('name','=',lot_id)])
            if lot_obj:
                lot = {
                    'id': lot_obj.id,
                    'name': lot_obj.name,
                    'expiration_date': lot_obj.expiration_date
                }
            else:
                lot = {
                    'id': -1,
                    'name': "",
                    'expiration_date': ""
                }
        w = []
        l = []
        if (len(l) > 0 and not self.env.user.has_group("inventory_log.group_use_locations")):
            w = self.env['stock.warehouse'].search_read([['lot_stock_id', 'parent_of', l[0]['id']]],['name'])
            l = []

        return {
            'p': p,
            'l': l,
            'w': w,
            'lot': lot
        }


    @api.model
    def create_purchase(self, products, supplier, dest, validate, ref, respon=False, sign=False):
        products = {int(k):v for k,v in products.items()}
        supplier = self.env['res.partner'].browse([supplier])[0]

        if self.env.user.has_group("inventory_log.group_use_locations"):
            dest = self.env['stock.location'].browse([dest])[0]
        else:
            dest = self.env['stock.warehouse'].browse([dest])[0].lot_stock_id
        _logger.info("DEBBUG dest "+str(dest))
        pick_type = self.env['stock.picking.type'].search([('code','=','incoming'),('default_location_dest_id','parent_of',dest.id)],limit=1)
        _logger.info("DEBBUG pick ttttt "+str(pick_type))
        if not pick_type:
            pick_type = self.env['stock.picking.type'].search(
                [('warehouse_id.company_id', '=', self.env.company.id), ('code', '=', 'incoming')],
                limit=1,
            )
        purchase = self.env['purchase.order'].create({
            'name': (self.env['ir.sequence'].next_by_code('purchase.order') or '') + _(' to ') + str(dest.name),
            'partner_id': supplier.id,
            'picking_type_id': pick_type.id,
            'responsable': respon,
            'res_signature': sign,
            'partner_ref': ref,
        })

        p_ids = self.env['product.product'].browse(products.keys())
        _logger.info("DEBBUG productos "+str(products))
        for p1 in p_ids:
            _logger.info("DEBBUG p_ids "+str(products[p1.id]))
            for p2 in products[p1.id]:
                _logger.info("DEBBUG p2 "+str(products[p1.id][p2]))
                move = self.env['purchase.order.line'].create({
                    'name': p1.name,
                    'product_id':p1.id,
                    'product_qty': products[p1.id][p2][1],
                    'order_id': purchase.id,
                    'date_planned': purchase.date_order,
                    'product_uom': p1.uom_id.id,
                    'price_unit': products[p1.id][p2][2],
                })
        
        purchase.button_confirm()

        for pick in purchase.picking_ids:
            for move in pick.move_lines:
                move.write({'location_dest_id': dest.id, 'quantity_done': move.product_uom_qty})
                move.move_line_ids.write({'location_dest_id': dest.id})

        if validate:
            purchase.picking_ids.button_validate()

        return True

    @api.model
    def warehouse_ops_count(self):
        count = []
        warehouses = self.env['stock.warehouse'].sudo().search_read([],['id','name','lot_stock_id'])
        for w in warehouses:
            temp_count = []
            temp_count.append(w)
            temp_count.append({
                'out': self.env['stock.picking'].search_count([('picking_type_code','=','outgoing'),('state','=','assigned'),('location_id','child_of',int(w['lot_stock_id'][0]))]),
                'inc': self.env['stock.picking'].search_count([('picking_type_code','=','incoming'),('state','=','assigned'),('location_dest_id','child_of',int(w['lot_stock_id'][0]))]),
                'int': self.env['stock.picking'].search_count([('picking_type_code','=','internal'),('state','=','assigned'),('location_id','child_of',int(w['lot_stock_id'][0]))])
            })
            count.append(temp_count)
        a = {'count': count, 'company': self.get_company_settings()}
        _logger.info("DEBBUG a "+str(a))
        return a

    @api.model
    def warehouse_ops_views(self, operation,date=False,location_id=False):
        
        domain = [['state','=','assigned']]
        name = ""
        context = dict(self._context or {})
        context['group_by'] = 'state'

        if operation == 'inc':
            domain += [['picking_type_code','=','incoming']]
            name = _("Receipts")
            if location_id:
                domain += [['location_dest_id','child_of',location_id]]
        elif operation == 'int':
            domain += [['picking_type_code','=','internal']]
            name = _("Internal Transfers")
            if location_id:
                domain += [['location_id','child_of',location_id]]
        elif operation == 'out':
            domain = [['state','in',['assigned', 'confirmed']], ['picking_type_code','=','outgoing']]
            context['search_default_available'] = 1
            name = _("Delivery Orders")
            if location_id:
                domain += [['location_id','child_of',location_id]]
            if date:
                domain += [['scheduled_date','>=',date+" 00:00:00"],['scheduled_date', '<=', date+" 23:59:59"]]

        
        
        return {
            'name': name,
            'type': 'ir.actions.act_window',
            'res_model': 'stock.picking',
            #'res_id': $(e.target).data('active-id'),
            'views': [[self.env.ref("inventory_log.stock_picking_kanban").id, 'kanban']],
            'target': 'fullscreen',
            'domain': domain,
            'context': context,
        }
    
    @api.model
    def get_warehouse_to_pick(self):
        return {
            'name': 'Show Warehouses',
            'type': 'ir.actions.act_window',
            'res_model': 'stock.warehouse',
            #'res_id': $(e.target).data('active-id'),
            'views': [[self.env.ref("inventory_log.warehouse_kanban_view").id, 'kanban']],
            'target': 'fullscreen',
            #'domain': domain,
        }

    @api.model
    def get_picking(self, pick_id,location_id=False,operation_type=False):
        picking = self.env['stock.picking'].search([('id', '=', pick_id)])
        zones = self.env['partner.delivery.zone'].search_read([],['id','name'])
        _logger.info("DEBBUG wfjkwrejfrjkhfwjiowerfjhklfewrqjklfewqrjklewfqjk")
        conf = False
        if location_id:
            conf = self.env['stock.picking.type'].sudo().operation_type_conf(location_id,operation_type)
        return {
            'picking': picking.read(), 
            'stock_move': picking.move_ids_without_package.read(['name','product_uom_qty','quantity_done','product_id','reserved_availability']), 
            'stock_move_line': picking.move_line_ids_without_package.read(['display_name','product_uom_qty','qty_done','product_id','lot_id','expired']), 
            'zones': zones, 
            'barcodes': self._get_barcodes(picking),
            'states': dict(picking._fields['state']._description_selection(self.env)),
            'conf': conf
        }


    @api.model
    def get_pickings(self, pick_id,location_id=False,operation_type=False):
        pickings = self.env['stock.picking'].search([('id', 'in', pick_id)])
        lines = []
        zones = self.env['partner.delivery.zone'].search_read([],['id','name'])
        conf = False
        
        if location_id:
            conf = self.env['stock.picking.type'].sudo().operation_type_conf(location_id,operation_type)
        pickings_name = []
        move_ids = []
        barcodes = []
        for picking in pickings:
            pickings_name.append(picking.name)
            if picking.move_line_ids_without_package:
                move_ids.extend(picking.move_line_ids_without_package.ids)
            barcodes.extend(self._get_barcodes(picking))
        move_lines = self.env['stock.move.line'].sudo().browse(move_ids)
        _logger.info("DEBBUG lines "+str(move_lines))
        dict_lines = groupby(move_lines,itemgetter('product_id'))
        for product in dict_lines:
            temp_lines = []
            for product_line in product[1]:
                temp_lines.append(
                    product_line.read(['name','product_uom_qty','qty_done','product_id','lot_id','picking_id'])[0]
                )
            lines.append({
                'product_id': product[0].read(['name'])[0],
                'lines': temp_lines,
                #'barcodes': self._get_barcodes(picking),
                'states': dict(picking._fields['state']._description_selection(self.env)),                })
        return {
            'pickings': pickings_name,
            'lines': lines,
            'zones': zones, 
            'conf': conf,
            'barcodes': barcodes    
        }

    @api.model
    def _get_barcodes(self, picking):
        barcodes = []
        for move_line in picking.move_line_ids_without_package:
            lot_id = False
            if move_line.lot_id:
                lot_id = move_line.lot_id.name
            barcodes.append({'product_id': move_line.product_id.barcode,'line': move_line.id, 'lot': lot_id})
        return barcodes


    @api.model
    def do_unreserve_log(self,pick_id):
        _logger.info("DEBBUG pìck_id "+str(pick_id))
        pick = self.env['stock.picking'].search([('id', '=', pick_id)], limit=1)
        if pick:
            pick.sudo().do_unreserve()
        return

    @api.model
    def validate_picking(self, pick_id, lines, b_order, dest, respon=False, sign=False, scheduled_date=False, delivery_zone_id=False,
    deliver_temperature=False, checked_quality=False, quality_message=False, temperature_quality=False, correct_state_van=False, logged_user_id=False):
        lines = {int(k):v for k,v in lines.items()}
        _logger.info("DEBBUG 1")
        pick = self.env['stock.picking'].search([('id', '=', pick_id)], limit=1)
        if dest:
            pick.write({'location_dest_id': dest['id']})
            _logger.info("DEBBUG 2")
        pick.write({
            'responsable': respon,
            'res_signature': sign,
            'scheduled_date':scheduled_date,
            'delivery_zone_id':delivery_zone_id,
            'deliver_temperature':deliver_temperature
        })
        _logger.info("DEBBUG 3")
        if not checked_quality and pick.picking_type_code == 'incoming':# and prod.tracking != 'none'
            _logger.info("DEBBUG 4")
            _logger.info("DEBBUG cheched quality "+str(checked_quality))
            if quality_message:
                _logger.info("DEBBUG "+str(quality_message))
                pick.write({
                    'quality_msg': quality_message
                })
                _logger.info("DEBBUG 5")
            pick.write({
                'quality_check': checked_quality,
                'state_of_the_van': correct_state_van,
                'correct_temperature': temperature_quality
            })
            _logger.info("DEBBUG 6")
            move_ids = []
            for m in pick.move_line_ids_without_package:
                _logger.info("DEBBUG 7")
                if not m.quality_check:
                    _logger.info("DEBBUG 8")
                    move_ids.append(m)
            _logger.info("DEBBUG bad lines "+str(move_ids))
            quality_check = self.env['quality.check'].sudo().create({
                'name':_('Quality Check ')+pick.name,
                'picking_id':pick.id,
                'message': quality_message,
                'state_of_the_van': pick.state_of_the_van,
                'temperature': pick.correct_temperature,
                'deliver_temperature': deliver_temperature,
            })
            _logger.info("DEBBUG 9")
            _logger.info("DEBBUG quality cgeck "+str(quality_check))
            _logger.info("DEBBUG move lines "+str(move_ids))
            if quality_check:
                _logger.info("DEBBUG 10")
                for m in move_ids:
                    _logger.info("DEBBUG 11")
                    quality_check.write({
                        'quality_line_ids':[(0,0,{
                            'name': m.product_id.name,
                            'product_id': m.product_id.id,
                            'lot_id': m.lot_id.id or False,
                            'qty_done': m.qty_done,
                            'correct_state_of_product': m.correct_state_of_product,
                            'quality_check': m.quality_check,
                            'reason_state': m.reason_state,
                            'failed_expiration': m.failed_expiration,
                            'reason_failed_expiration': m.reason_failed_expiration,
                            'validated_on_date': m.validated_on_date,
                            'overdue_days' : m.overdue_days,
                        })]
                    })
                _logger.info("DEBBUG 12")
                if self.env.user.has_group("inventory_log.group_enable_quality_control") and self.env.user.company_id.quality_responsable_user_id and self.env.user.has_group("inventory_log.group_send_quality_mail"):
                    quality_check.sudo().send_mail_template_quality(logged_user_id)
                    _logger.info("DEBBUG 13")
        _logger.info("DEBBUG 14")
        need_BO = False
        for move in pick.move_ids_without_package:
            _logger.info("DEBBUG 15")
            if move.product_uom_qty > move.quantity_done:
                _logger.info("DEBBUG 16")
                need_BO = True

        if need_BO:
            _logger.info("DEBBUG 17")
            backorder = self.env['stock.backorder.confirmation'].create({'pick_ids': [(6, _, [pick.id])]}) #{'pick_ids': [(6, _, [pick.id])], 'backorder_confirmation_line_ids': [(0, 0, {'to_backorder': True, 'picking_id': pick.id})]})
            if b_order == 1 or b_order == '1':
                _logger.info("DEBBUG 18")
                return backorder.with_context(button_validate_picking_ids = [pick.id]).process()
            else:
                _logger.info("DEBBUG 19")
                return backorder.process_cancel_backorder()
        _logger.info("DEBBUG 20")
        return pick.with_context(skip_overprocessed_check=True).button_validate()

    def multi_validation(self,picking_id,b_order, logged_user_id):
        pick = self.env['stock.picking'].search([('id', '=', picking_id)], limit=1)
        if not pick.state_of_the_van and pick.picking_type_code == 'incoming':
            move_ids = []
            for m in pick.move_line_ids_without_package:
                if not m.correct_state_of_product:
                    move_ids.append(m.id)
            _logger.info("DEBBUG bad lines "+str(move_ids))
            quality_check = self.env['quality.check'].sudo().create({
                'name':_('Quality Check ')+pick.name,
                'picking_id':pick.id,
                'message': pick.quality_msg
            })
            _logger.info("DEBBUG quality cgeck "+str(quality_check))
            _logger.info("DEBBUG move lines "+str(move_ids))
            if quality_check and self.env.user.has_group("inventory_log.group_enable_quality_control") and self.env.user.company_id.quality_responsable_user_id and self.env.user.has_group("inventory_log.group_send_quality_mail"):
                for m in move_ids:
                    quality_check.write({
                        'move_line_ids': [(4,m)]
                    })
                    quality_check.sudo().send_mail_template_quality(logged_user_id)
        need_BO = False
        for move in pick.move_ids_without_package:
            if move.product_uom_qty > move.quantity_done:
                need_BO = True

        if need_BO:
            backorder = self.env['stock.backorder.confirmation'].create({'pick_ids': [(6, _, [pick.id])]}) #{'pick_ids': [(6, _, [pick.id])], 'backorder_confirmation_line_ids': [(0, 0, {'to_backorder': True, 'picking_id': pick.id})]})
            if b_order == 1 or b_order == '1':
                return backorder.with_context(button_validate_picking_ids = [pick.id]).process()
            else:
                return backorder.process_cancel_backorder()

        return pick.with_context(skip_overprocessed_check=True).button_validate()        

    @api.model
    def validate_pickings(self, pick_ids, b_order, logged_user_id):
        _logger.info("DEBBUG pick_ids "+str(pick_ids))
        #picking_ids = self.env['stock.picking'].search([('id', 'in', pick_ids)])
        for pick_id in pick_ids:
            self.multi_validation(pick_id,b_order, logged_user_id)
        return True
        
    @api.model
    def check_barcode_validation(self, barcode, list_moves):
        list_moves = [int(k) for k in list_moves]
        p = self.env['product.product'].search(['|','|','|',['barcode', '=', barcode],['barcode', '=', barcode.replace("'","-")],['name', '=', barcode],['name', '=', barcode.replace("'","-")]]).mapped('id')
        l = self.env['stock.location'].search_read(['|','|','|',['barcode', '=', barcode],['barcode', '=', barcode.replace("'","-")],['name', '=', barcode],['name', '=', barcode.replace("'","-")]],['display_name'])
        if len(p) == 0:
            return {'l': l, 'moves': []}
        moves = self.env['stock.move'].search_read([('id','in',list_moves),('product_id','in',p)],['name'])
        return {'l': l, 'moves': moves}

    def set_quants_lot_expiration_date(self, quants):
        for quant in quants:
            quant['lot_date'] = ''
            if 'lot_id' in quant and quant['lot_id']:
                lot = self.env['stock.production.lot'].browse(quant['lot_id'][0])
                if lot.expiration_date:
                    quant['lot_date'] = lot.expiration_date.strftime('%d/%m/%Y')
                elif lot.use_date:
                    quant['lot_date'] = lot.use_date.strftime('%d/%m/%Y')
    @api.model
    def quick_info_barcode(self, barcode,barcode_type=False,lot_id=False):
        p = self.env['product.product'].search_read(['|','|','|',['barcode', '=', barcode],['barcode', '=', barcode.replace("'","-")],['name', '=', barcode],['name', '=', barcode.replace("'","-")]],['display_name'])
        l = self.env['stock.location'].search_read(['|','|','|',['barcode', '=', barcode],['barcode', '=', barcode.replace("'","-")],['name', '=', barcode],['name', '=', barcode.replace("'","-")]],['display_name'])

        self.env['stock.quant']._merge_quants()
        self.env['stock.quant']._unlink_zero_quants()
        if len(p) > 0:
            if barcode_type and barcode_type == 'gs1' and lot_id:
                quants = self.env['stock.quant'].search([('product_id', '=', p[0]['id']),('lot_id.name','=',lot_id)]).filtered(lambda quant: quant.location_id.usage == 'internal').read(['location_id', 'reserved_quantity', 'quantity','lot_id','owner_id'])
            elif barcode_type and barcode_type == 'gs1':
                quants = self.env['stock.quant'].search([('product_id', '=', p[0]['id'])]).filtered(lambda quant: quant.location_id.usage == 'internal').read(['location_id', 'reserved_quantity', 'quantity','lot_id','owner_id'])
            else:
                quants = self.env['stock.quant'].search([('product_id', '=', p[0]['id'])]).filtered(lambda quant: quant.location_id.usage == 'internal').read(['location_id', 'reserved_quantity', 'quantity'])
                self.set_quants_lot_expiration_date(quants)
            return {'mode': 'p', 'name': p[0]['display_name'], 'quants': quants}
        elif len(l) > 0:
            quants = self.env['stock.quant'].search_read([('location_id', 'child_of', l[0]['id'])], ['product_id', 'reserved_quantity', 'quantity'])
            return {'mode': 'l', 'name': l[0]['display_name'], 'quants': quants}
        else:
            return False  

    @api.model
    def quick_info_reference(self, reference):
        p = self.env['product.product'].search_read([['default_code', 'ilike', reference]],['display_name'])
        _logger.info("DEBBUG QUICK REFERENCE PRODUCT "+str(p))

        self.env['stock.quant']._merge_quants()
        self.env['stock.quant']._unlink_zero_quants()
        if len(p) > 0:
            quants = self.env['stock.quant'].search([('product_id', '=', p[0]['id'])]).filtered(lambda quant: quant.location_id.usage == 'internal').read(['location_id', 'reserved_quantity', 'quantity','lot_id','owner_id'])
            self.set_quants_lot_expiration_date(quants)
            return {'mode': 'p', 'name': p[0]['display_name'], 'quants': quants}
        else:
            return False  

    @api.model
    def quick_info_by_id(self, id, mode):
        if mode == 'p':
            p = self.env['product.product'].search_read([['id', '=', id]],['display_name'])
        else:
            l = self.env['stock.location'].search_read([['id', '=', id]],['display_name'])

        self.env['stock.quant']._merge_quants()
        self.env['stock.quant']._unlink_zero_quants()
        if mode == 'p' and len(p) > 0:
            quants = self.env['stock.quant'].search([('product_id', '=', p[0]['id'])]).filtered(lambda quant: quant.location_id.usage == 'internal').read(['location_id', 'reserved_quantity', 'quantity','lot_id','owner_id'])
            self.set_quants_lot_expiration_date(quants)
            return {'mode': 'p', 'name': p[0]['display_name'], 'quants': quants}
        elif mode == 'l' and len(l) > 0:
            quants = self.env['stock.quant'].search_read([('location_id', 'child_of', l[0]['id'])], ['product_id', 'reserved_quantity', 'quantity','lot_id','owner_id'])
            self.set_quants_lot_expiration_date(quants)
            return {'mode': 'l', 'name': l[0]['display_name'], 'quants': quants}
        else:
            return False    

    @api.model
    def create_scrap(self, lines, logged_user_id, scrap_motive):
        _logger.info("DEBBUG lines "+str(lines))
        _logger.info("DEBBUG lines keys "+str(lines.keys()))
        body = ""
        scrap_location = self.env['stock.location'].search([('scrap_location','=',True)],limit=1)
        scraps = []
        for loc_k in lines.keys():
            body = body + lines[loc_k]['name'] +' '
            for prod_k in lines[loc_k].keys():
                if prod_k != 'name':
                    for lot in lines[loc_k][prod_k].keys():
                        product_id = self.env['product.product'].sudo().browse(int(prod_k))
                        if product_id.tracking != 'none':
                            lot_id = False
                            expiration_date = False
                            if lot != -1:
                                lot_id = lines[loc_k][prod_k][lot]['lot_id']['id']
                                expiration_date = lines[loc_k][prod_k][lot]['lot_id']['expiration_date']
                            scrap = self.env['stock.scrap'].create({
                                'product_id': int(prod_k),
                                'product_uom_id': product_id.uom_id.id,
                                'scrap_qty': lines[loc_k][prod_k][lot]['qty'],
                                'lot_id': lot_id,
                                'location_id': int(loc_k),
                                'scrap_location_id': scrap_location.id
                            })
                            
                        else:
                            scrap = self.env['stock.scrap'].create({
                                'product_id': int(prod_k),
                                'product_uom_id': product_id.uom_id.id,
                                'scrap_qty': lines[loc_k][prod_k][lot]['qty'],
                                'location_id': int(loc_k),
                                'scrap_location_id': scrap_location.id
                            })
                        scrap.do_scrap()
                        scraps.append(scrap)
                            
        if self.env.user.has_group("inventory_log.group_enable_inventory_loss") and len(scraps) != 0 and self.env.user.company_id.inventory_loss_responsable_user_id and self.env.user.has_group("inventory_log.group_send_inventory_loss_mail"):
            self.send_mail_template_scrap(logged_user_id, scraps, scrap_motive)

    @api.model
    def create_picking_with_email(self, products, orig, dest, respon=False, sign=False, logged_user_id=False):
        check = self.check_avail(products, orig)
        if type(check) is str:
            return check
        location = False
        products = {int(k):v for k,v in products.items()}
        if self.env.user.has_group("inventory_log.group_use_locations"):
            orig = self.env['stock.location'].browse([orig])[0]
            dest = self.env['stock.location'].browse([dest])[0]
            location = True
        else:
            orig = self.env['stock.warehouse'].browse([orig])[0].lot_stock_id
            dest = self.env['stock.warehouse'].browse([dest])[0].lot_stock_id
        picking = self.env['stock.picking'].create({
            'name': str(orig.name)+_(" to ")+str(dest.name)+" "+str(datetime.today().strftime("%d/%m/%Y, %H:%M:%S")),
            'location_id': orig.id,
            'employee_id': False,
            'location_dest_id': dest.id,
            'picking_type_id': self.env.ref('stock.picking_type_internal').id,
            'responsable': respon,
            'res_signature': sign,
        })
        moves = []
        p_ids = self.env['product.product'].browse(products.keys())
        for p1 in p_ids:
            move = self.env['stock.move'].create({
                'name': p1.name,
                'product_id':p1.id,
                'product_uom_qty': products[p1.id][1],
                'product_uom':p1.uom_id.id,
                'picking_id': picking.id,
                'location_id': orig.id,
                'location_dest_id': dest.id,
            })
            moves.append(move)
        try:
            picking.action_confirm()
            picking.action_assign()
            for m in moves:
                m.quantity_done = m.product_uom_qty
            picking.action_done()
        except:
            return False
        if location and dest.scrap_location and logged_user_id and\
                    self.env.user.has_group("inventory_log.group_enable_inventory_loss") and \
                    len(moves) != 0 and self.env.user.company_id.inventory_loss_responsable_user_id and \
                    self.env.user.has_group("inventory_log.group_send_inventory_loss_mail"):
                self.send_mail_template_inv_transfer_scrap(logged_user_id, moves, _("Scraps done with the Internal transfer system"))
        return True

    @api.model
    def create_inventory(self, lines, logged_user_id, inv_upd_motive):
        _logger.info("DEBBUG lines "+str(lines))
        _logger.info("DEBBUG lines keys "+str(lines.keys()))
        body = ""
        for loc_k in lines.keys():
            products = list(lines[loc_k].keys())
            products.remove('name')
            products = [int(k) for k in products]
            inv = self.env['stock.inventory'].create({
                'name': _("InvApp ") + lines[loc_k]['name'] + ' ' + str(fields.Date.today()), 
                'location_ids': [(6,0, [int(loc_k)])],
                'product_ids': [(6,0, products)],
                'start_empty': True
                })
            inv.action_start()
            body = body + lines[loc_k]['name'] +' '
            for prod_k in lines[loc_k].keys():
                if prod_k != 'name':
                    for lot in lines[loc_k][prod_k].keys():
                        product_id = self.env['product.product'].sudo().browse(int(prod_k))
                        lot_id = False
                        expiration_date = False
                        if lot != -1:
                            lot_id = lines[loc_k][prod_k][lot]['lot_id']['id']
                            expiration_date = lines[loc_k][prod_k][lot]['lot_id']['expiration_date']
                        _logger.info("DEBBUG product "+str(product_id))
                        _logger.info("DEBBUG location_id "+str(loc_k))
                        _logger.info("DEBBUG qty "+str(lines[loc_k][prod_k][lot]['qty']))
                        _logger.info("DEBBUG prod_lot_id "+str(lot_id))
                        _logger.info("DEBBUG product_id.tracking "+str(product_id.tracking))
                        if product_id.tracking != 'none':
                            _logger.info("DEBBUG product k "+str(int(prod_k)))
                            values = {
                                'inventory_id': inv.id,
                                # 'name': _("Inventory App ") + str(fields.datetime.now()), 
                                'product_id': int(prod_k),
                                'location_id': int(loc_k),
                                'product_qty': lines[loc_k][prod_k][lot]['qty'],
                                'prod_lot_id': lot_id,
                                #'expiration_date':expiration_date
                            }
                            line = self.env['stock.inventory.line'].create(values)
                        else:
                            self.env['stock.inventory.line'].create({
                                'inventory_id': inv.id,
                                # 'name': _("Inventory App ") + str(fields.datetime.now()), 
                                'product_id': int(prod_k),
                                'location_id': int(loc_k),
                                'product_qty': lines[loc_k][prod_k][lot]['qty'],
                            })
            _logger.info("DEBBUG lines "+str(inv.line_ids))
            if self.env.user.has_group("inventory_log.group_enable_inventory_loss") and self.env.user.company_id.inventory_loss_responsable_user_id and self.env.user.has_group("inventory_log.group_send_inventory_loss_mail"):
                inv.send_mail_template_inventory(logged_user_id, inv_upd_motive)
            _logger.info("DEBBUG inv "+str(inv.read()))
            inv.action_validate()

    @api.model
    def get_warehouse(self,warehouse_id=False):
        company = self.get_company_settings()
        if warehouse_id:
            return [self.env['stock.warehouse'].sudo().search_read([('id','=',warehouse_id)],limit=1),self.env['partner.delivery.zone'].sudo().search_read([],['id','display_name']),company]
        elif self.env.user.employee_ids:
            if self.env.user.employee_ids[0] and self.env.user.employee_ids[0].address_id:
                w = self.env['stock.warehouse'].sudo().search_read([('partner_id','=',self.env.user.employee_ids[0].address_id.id)],limit=1)
                if w:
                    return [w,self.env['partner.delivery.zone'].sudo().search_read([],['id','display_name']),company]

        return [self.env['stock.warehouse'].sudo().search_read([],limit=1),self.env['partner.delivery.zone'].sudo().search_read([],['id','display_name']),company]

    @api.model
    def get_company_settings(self):
        return{
            'filters': self.env.user.has_group('inventory_log.group_enable_filters'),
            'date_filters': self.env.user.has_group('inventory_log.group_enable_date_filters'),
            'customer_filters': self.env.user.has_group('inventory_log.group_enable_customer_filters'),
            'warehouse_filters': self.env.user.has_group('inventory_log.group_enable_warehouse_filters'),
            'location_filters': self.env.user.has_group('inventory_log.group_enable_location_filters'),
            'delivery_zone_filters': self.env.user.has_group('inventory_log.group_enable_delivery_zone_filters'),
            'signature': self.env.user.has_group('inventory_log.group_enable_signature'),
            'manual_gs1': self.env.user.has_group('inventory_log.group_enable_manual_gs1'),
            '': self.env.user.has_group('inventory_log.group_enable_lot_sequence'),
            'quality_control_group': self.env.user.has_group("inventory_log.group_enable_quality_control"),

        }

    @api.model
    def upddate_lines(self,lines):
        for l in lines:
            stock_line = self.env['stock.move.line'].sudo().browse(l['stock_move_line'])
            stock_line.sudo().write({
                'qty_done': l['qty_done']
            })
        return True
    
    @api.model
    def get_stock_lines(self,warehouse_id=False,date=False,filter_groupby=False,zones=False):
        domain = [['state','=','assigned'],['picking_type_code','=','outgoing']]
        grouped_pickings = []
        if date:
            domain += [['scheduled_date','>=',date+" 00:00:00"],['scheduled_date', '<=', date+" 23:59:59"]]
        if warehouse_id:
            warehouse = self.env['stock.warehouse'].sudo().browse(warehouse_id)
            if warehouse and warehouse.lot_stock_id:
                domain += [['location_id','child_of',warehouse.lot_stock_id[0].id]]
        filter_default = 'location_id'
        filter_name = 'Group by location'
        if filter_groupby:
            if filter_groupby == 'filter_zone' and zones and len(zones) > 0:
                zone_ids = []
                for z in zones:
                    zone_ids.append(int(z['id']))
                domain += [['delivery_zone_id','in',zone_ids]]
                filter_default = 'delivery_zone_id' 
                filter_name = 'Group by delivery zones'
            elif filter_groupby == 'filter_zone':
                filter_default = 'delivery_zone_id'
            elif filter_groupby == 'filter_user':
                filter_default = 'partner_id'
                filter_name = 'Group by partner'
        pickings = groupby(self.env['stock.picking'].sudo().search(domain), itemgetter(filter_default))
        for p in pickings:
            temp_pickings = []
            for pick in p[1]:
                temp_pickings.append(pick.read(['name']))
            if p[0].name:
                grouped_pickings.append([p[0].read(['name']),temp_pickings])
            else:
                grouped_pickings.append([_('Not defined'),temp_pickings])


        return {'grouped_pickings':grouped_pickings,'filter_name':filter_name}

    @api.model
    def get_stock_move(self, pick_id):
        picking = self.env['stock.picking'].search([('id', '=', pick_id)], limit=1)
        return {
            'stock_move': picking.move_ids_without_package.read(['name','product_uom_qty','quantity_done','product_id','reserved_availability']), 
            'stock_move_line': picking.move_line_ids_without_package.read(['display_name','product_uom_qty','qty_done','product_id','lot_id']), 
        }

    def send_mail_template_scrap(self, logged_user_id, scrap_lines, scrap_motive):
        logged_user = self.env['res.users'].browse(logged_user_id)
        user = self.env.user.company_id.inventory_loss_responsable_user_id
        if user.notification_type == 'inbox':
            self.inbox_message(user, logged_user, scrap_lines, scrap_motive)
        else:
            datetime_now = datetime.now()
            email_from = 'bot@example.com'
            email_to = self.env.user.company_id.inventory_loss_responsable_user_id.email_formatted
            scrap_lines_html = self.get_scrap_lines(scrap_lines, logged_user, datetime_now, scrap_motive)
            _logger.info('palabra ' + scrap_lines_html)
            try:
                template_id = self.env['ir.model.data'].get_object_reference('inventory_log', 'scrap_created_email_template_v1_0')[1]
                email_values = {
                    'email_from': email_from, 
                    'email_to': email_to, 
                    'lang': user.lang, 
                    'scrap_lines':scrap_lines_html, 
                    'user': logged_user.name, 
                    'datetime': datetime_now,
                    }
            except ValueError:
                return
            self.env['mail.template'].browse(template_id).with_context(email_values).sudo().send_mail(
                self.id, 
                force_send=True
                )

    def get_scrap_lines(self, scrap_lines, logged_user, datetime_now, scrap_motive):
        message_text = "A product was discarded by " + str(logged_user.name) + ' at ' + datetime.now().strftime("%Y-%m-%d %H:%M:%S") + ':\n'
        for scrap in scrap_lines:
            message_text += '- ' + _('Product: ') + ' ' + str(scrap.product_id.name) + '\n'
            if scrap.product_id.tracking != 'none':
                message_text += '   - ' + _('Lot: ') + ' ' + str(scrap.lot_id.name) + '\n'
            message_text += '   - ' + _('Qty: ') + ' ' + str(scrap.scrap_qty) + '\r\n'
            message_text += '   - ' + _('Location: ') + ' ' + str(scrap.location_id.name) + '\r\n'
        message_text += '   - ' + _('Motive: ') + ' ' + str(scrap_motive) + '\r\n'
        return message_text

    
    def send_mail_template_inv_transfer_scrap(self, logged_user_id, scrap_lines, scrap_motive):
        logged_user = self.env['res.users'].browse(logged_user_id)
        user = self.env.user.company_id.inventory_loss_responsable_user_id
        if user.notification_type == 'inbox':
            self.inbox_message(user, logged_user, scrap_lines, scrap_motive)
        else:
            datetime_now = datetime.now()
            email_from = 'bot@example.com'
            email_to = self.env.user.company_id.inventory_loss_responsable_user_id.email_formatted
            scrap_lines_html = self.get_scrap_inv_transfer_lines(scrap_lines, logged_user, datetime_now, scrap_motive)
            _logger.info('palabra ' + scrap_lines_html)
            try:
                template_id = self.env['ir.model.data'].get_object_reference('inventory_log', 'scrap_created_email_template_v1_0')[1]
                email_values = {
                    'email_from': email_from, 
                    'email_to': email_to, 
                    'lang': user.lang, 
                    'scrap_lines':scrap_lines_html, 
                    'user': logged_user.name, 
                    'datetime': datetime_now,
                    }
            except ValueError:
                return
            self.env['mail.template'].browse(template_id).with_context(email_values).sudo().send_mail(
                self.id, 
                force_send=True,
                email_values={
                    'email_from': email_from, 
                    'email_to': email_to, 
                    'lang': user.lang, 
                    'scrap_lines':scrap_lines_html, 
                    'user': logged_user.name, 
                    'datetime': datetime_now,
                    }
                )

    def get_scrap_inv_transfer_lines(self, scrap_lines, logged_user, datetime_now, scrap_motive):
        message_text = "A product was discarded by " + str(logged_user.name) + ' at ' + datetime_now + ':\n'
        for scrap in scrap_lines:
            message_text += '- ' + _('Product: ') + ' ' + str(scrap.product_id.name) + '\n'
            message_text += '   - ' + _('Qty: ') + ' ' + str(scrap.product_uom_qty) + '\r\n'
            message_text += '   - ' + _('Origin location: ') + ' ' + str(scrap.location_id.name) + '\r\n'
            message_text += '   - ' + _('Destination location: ') + ' ' + str(scrap.location_dest_id.name) + '\r\n'
        message_text += '   - ' + str(scrap_motive) + '\r\n'
        return message_text

   

    def inbox_message(self, user, logged_user, scrap_lines, scrap_motive):
        """
        Send user chat notification on picking validation.
        """
        
        # construct the message that is to be sent to the user
        
        message_text = '<div style="line-height: 1.6;">'
        message_text += '<span>'
        if len(scrap_lines) == 1:
            message_text += _('A product was discarded by ')
        else:
            message_text += _('Several products have been discarded by ')
        message_text += str(logged_user.name)
        message_text += _(' at ')
        message_text += datetime.now()
        message_text += ' :</span>'
        message_text += '<ul>'
        for scrap in scrap_lines:
            message_text += '<li><span style="font-weight: bolder;">' + _('Product: ') + '</span>' + str(scrap.product_id.name) + '</li>'
            message_text += '<ul>'
            if scrap.product_id.tracking != 'none':
                message_text += '<li><span style="font-weight: bolder;">' + _('Lot: ') + '</span>' + str(scrap.lot_id.name) + '</li>'
            message_text += '<li><span style="font-weight: bolder;">' + _('Qty: ') + '</span>' + str(scrap.scrap_qty) + '</li>'
            message_text += '<li><span style="font-weight: bolder;">' + _('Location: ') + '</span>' + str(scrap.location_id.name) + '</li>'
            message_text += '</ul>'
        message_text += '<li><span style="font-weight: bolder;">' + _('Location: ') + '</span>' + str(scrap_motive) + '</li>'
        message_text += '</ul>'
        message_text += '</div>'

        # odoo runbot
        odoobot_id = self.env['ir.model.data'].sudo().xmlid_to_res_id("base.partner_root")

        # find if a channel was opened for this user before
        channel = self.env['mail.channel'].sudo().search([
            ('name', '=', 'Product Discarded'),
            ('channel_partner_ids', 'in', [user.partner_id.id])
        ],
            limit=1,
        )

        if not channel:
            # create a new channel
            channel = self.env['mail.channel'].with_context(mail_create_nosubscribe=True).sudo().create({
                'channel_partner_ids': [(4, user.partner_id.id), (4, odoobot_id)],
                'public': 'private',
                'channel_type': 'chat',
                'email_send': False,
                'name': 'Product Discarded',
                'display_name': 'Product Discarded',
            })

        # send a message to the related user
        channel.sudo().message_post(
            body=message_text,
            author_id=odoobot_id,
            message_type="comment",
            subtype="mail.mt_comment",
        )
        
    @api.model
    def check_avail(self, products, id):
        msg_error = ""

        # _logger.info("ID " + str(id))
        # _logger.info(str(products))
        products = {int(k):v for k,v in products.items()}

        p_ids = self.env['product.product'].browse(products.keys())
        loc = self.env.user.has_group("inventory_log.group_use_locations")
        for p in p_ids:
            _logger.info("ID " + str(id))
            if not loc:
                real_qty = p.with_context(warehouse=id).qty_available
            else:
                real_qty = p.with_context(location=id).qty_available
            # _logger.info(str(products[p.id][1]) + " " + str(real_qty))
            _logger.info("DEBBUG products "+str(products))
            if len(products[p.id]) == 1 and '0' in products[p.id]:
                if products[p.id]['0'][3] != 'none':
                    if len(msg_error) == 0:
                        msg_error += _("You need to specify the lot / serial number for:<br/>")
                    msg_error += _("%s<br/>") % (p.name)
                if products[p.id]['0'][1] > real_qty:
                    if len(msg_error) == 0:
                        msg_error += _("Not enough stock for:<br/>")
                    msg_error += _("%s: current (%s)/ asked (%s)<br/>") % (p.name, real_qty, products[p.id][1])

        if len(msg_error) > 0:
            return msg_error

        return True

    @api.model
    def avail_prod(self, id):
        loc = self.env.user.has_group("inventory_log.group_use_locations")
        if not loc:
            products = self.env['product.product'].with_context(warehouse=id).search([('qty_available','>',0)])
        else:
            products = self.env['product.product'].with_context(location=id).search([('qty_available','>',0)])

        return products.mapped('id')

    @api.model
    def check_barcode(self, barcode):
        p = self.env['product.product'].search_read([['barcode', '=', barcode]],['name'])
        if (len(p) > 0):
            return ['p',p[0]]
        l = self.env['stock.location'].search_read([['barcode', '=', barcode]],['name'])
        if (len(l) > 0):
            if self.env.user.has_group("inventory_log.group_use_locations"):
                return ['l',l[0]]
            else:
                w = self.env['stock.warehouse'].search_read([['lot_stock_id', '=', l[0]['id']]],['name'])
                if (len(w) > 0):
                    return ['w',w[0]]
        return False

    @api.model
    def create_picking(self, products, orig, dest, respon=False, sign=False):
        check = self.check_avail(products, orig)
        if type(check) is str:
            return check

        _logger.info(str(products))
        products = {int(k):v for k,v in products.items()}

        if self.env.user.has_group("inventory_log.group_use_locations"):
            orig = self.env['stock.location'].browse([orig])[0]
            dest = self.env['stock.location'].browse([dest])[0]
        else:
            orig = self.env['stock.warehouse'].browse([orig])[0].lot_stock_id
            dest = self.env['stock.warehouse'].browse([dest])[0].lot_stock_id

        picking = self.env['stock.picking'].create({
            'name': str(orig.name)+_(" to ")+str(dest.name)+" "+str(datetime.today().strftime("%d/%m/%Y, %H:%M:%S")),
            'location_id': orig.id,
            'location_dest_id': dest.id,
            'picking_type_id': self.env.ref('stock.picking_type_internal').id,
            'responsable': respon,
            'res_signature': sign,
        })
        _logger.info("DEBBUG name "+str(picking.name))
        _logger.info("DEBBUG location_id "+str(picking.location_id))
        _logger.info("DEBBUG location_dest_id "+str(picking.location_dest_id))
        _logger.info("DEBBUG picking_type_id "+str(picking.picking_type_id))
        _logger.info("DEBBUG responsable "+str(picking.responsable))
        moves = []

        p_ids = self.env['product.product'].browse(products.keys())
        _logger.info("DEBBUG product "+str(products))
#if len(products[p.id]) == 1 and products[p.id]['0'][1] > real_qty:
        for p1 in p_ids:
            if len(products[p1.id]) == 1 and '0' in products[p1.id]:
                move = self.env['stock.move'].create({
                    'name': p1.name,
                    'product_id':p1.id,
                    'product_uom_qty': products[p1.id]['0'][1],
                    'product_uom':p1.uom_id.id,
                    'picking_id': picking.id,
                    'location_id': orig.id,
                    'location_dest_id': dest.id,
                })
                moves.append(move)
                move.quantity_done = move.product_uom_qty
            else:
                for p2 in products[p1.id]:
                    if p2 == '0':
                        move = self.env['stock.move'].create({
                            'name': p1.name,
                            'product_id':p1.id,
                            'product_uom_qty': products[p1.id][p2][1],
                            'product_uom':p1.uom_id.id,
                            'picking_id': picking.id,
                            'location_id': orig.id,
                            'location_dest_id': dest.id,
                        })
                        moves.append(move)
                        move.quantity_done = move.product_uom_qty
                    else:
                        move = self.env['stock.move'].create({
                            'name': p1.name,
                            'product_id':p1.id,
                            'product_uom_qty': products[p1.id][p2][1],
                            'product_uom':p1.uom_id.id,
                            'picking_id': picking.id,
                            'location_id': orig.id,
                            'location_dest_id': dest.id,
                        })
                        move_line = self.env['stock.move.line'].create({
                            'move_id': move.id,
                            'lot_id': int(p2),
                            'qty_done': products[p1.id][p2][1],
                            'product_uom_qty': products[p1.id][p2][1],
                            'product_id': p1.id,
                            'product_uom_id':p1.uom_id.id,
                            'location_id': orig.id,
                            'location_dest_id': dest.id,
                            'picking_id': picking.id,
                        })
                        moves.append(move)       
        '''picking.action_assign()
        for m in picking.move_line_ids:
            m.qty_done = m.product_uom_qty
        for m2 in moves:
            m2.quantity_done = m2.product_uom_qty
            m2.reserved_availability = 0
        self.sudo().env.ref('stock.stock_quant_stock_move_line_desynchronization').run()
        picking.button_validate()
        return False'''              
        try:
            picking.action_assign()
            for m in picking.move_line_ids:
                m.qty_done = m.product_uom_qty
            for m2 in moves:
                m2.quantity_done = m2.product_uom_qty      
            self.sudo().env.ref('stock.stock_quant_stock_move_line_desynchronization').run()  
            picking.button_validate()
            return True
        except:
            return False