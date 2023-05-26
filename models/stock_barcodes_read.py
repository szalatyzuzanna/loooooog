# Copyright 2019 Sergio Teruel <sergio.teruel@tecnativa.com>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).
from odoo import _, models, api
import logging
_logger = logging.getLogger(__name__)

class WizStockBarcodesRead(models.AbstractModel):
    _inherit = 'wiz.stock.barcodes.read'

    @api.model
    def process_barcode_gs1_inherited(self, barcode):
        _logger.info("DEBBUG efdhgerjbfjrhbfjrhb")
        try:
            barcode_decoded = self.env['gs1_barcode'].decode(barcode)
            _logger.info("DEBBUG barcodeffff decoded "+str(barcode_decoded))
            return barcode_decoded
        except Exception:
            _logger.info("DEBBUG barcodeffff exception ")
            return super().process_barcode(barcode)