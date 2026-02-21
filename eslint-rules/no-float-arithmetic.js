/**
 * ESLint custom rule: no-float-arithmetic
 * TDD: Float yasak. Tüm para/gram hesaplamaları decimal.js kullanmalı.
 * Yanlış: 0.1 + 0.2, price * quantity (number ile)
 * Doğru: new Decimal('0.1').plus('0.2'), Decimal.mul(price, quantity)
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Float ile aritmetik işlem yasak. decimal.js kullanın.',
      recommended: true,
    },
    schema: [],
    messages: {
      noFloat: 'Float aritmetiği yasak. Decimal veya branded type kullanın (decimal.js).',
      parseFloat: 'parseFloat kullanımı yasak. Decimal kullanın.',
    },
  },
  create(context) {
    const BINARY_OPS = ['+', '-', '*', '/', '%'];
    const DECIMAL_IDS = ['Decimal', 'D'];

    function isDecimalCall(node) {
      if (node.type !== 'CallExpression') return false;
      const callee = node.callee;
      if (callee.type === 'Identifier') {
        return DECIMAL_IDS.includes(callee.name);
      }
      if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier') {
        return DECIMAL_IDS.includes(callee.object.name);
      }
      return false;
    }

    function hasFloatLiteral(node) {
      if (!node) return false;
      if (node.type === 'Literal' && typeof node.value === 'number') {
        return !Number.isInteger(node.value);
      }
      if (node.type === 'BinaryExpression' || node.type === 'CallExpression') {
        return true; // sonuç float olabilir
      }
      if (node.type === 'Identifier') {
        return false; // değişken - kontrol edemeyiz
      }
      return false;
    }

    return {
      BinaryExpression(node) {
        if (!BINARY_OPS.includes(node.operator)) return;
        // Float literal kullanımını tespit et
        const leftFloat = node.left.type === 'Literal' && typeof node.left.value === 'number' && !Number.isInteger(node.left.value);
        const rightFloat = node.right.type === 'Literal' && typeof node.right.value === 'number' && !Number.isInteger(node.right.value);
        if (leftFloat || rightFloat) {
          context.report({ node, messageId: 'noFloat' });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'Identifier' && callee.name === 'parseFloat') {
          context.report({ node, messageId: 'parseFloat' });
        }
      },
    };
  },
};
