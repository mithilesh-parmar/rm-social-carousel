"""Fast checks for the non-rendering core: python3 -m unittest discover -s video/tests"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rmvideo import content, tts  # noqa: E402
from rmvideo.text import TextBlock, tokenize  # noqa: E402

EXAMPLE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'scripts', 'india-psyllium-80.yaml')

class Rules(unittest.TestCase):
    def hits(self, txt, lang='en'):
        return {h['rule'] for h in content.check_rules({'x': txt}, lang)}

    def test_blocks(self):
        self.assertIn('no-fssc', self.hits('We are FSSC 22000 certified'))
        self.assertIn('no-40-years', self.hits('40 years of family experience'))
        self.assertIn('no-40-years', self.hits('40 साल का अनुभव', 'hi'))
        self.assertIn('no-moq', self.hits('MOQ: 1 container'))
        self.assertIn('no-moq', self.hits('минимальный заказ 1 тонна', 'ru'))
        self.assertIn('no-health-cure', self.hits('Psyllium cures constipation'))
        self.assertIn('no-health-cure', self.hits('यह कब्ज़ का इलाज है', 'hi'))
        self.assertIn('no-health-cure', self.hits('治疗便秘', 'zh'))

    def test_clean_example(self):
        s = content.load_script(EXAMPLE)
        self.assertEqual(content.check_rules(content.collect_strings(s)), [])

class Glossary(unittest.TestCase):
    def test_missing_term_and_cue(self):
        src = {'a.say': 'This is [[x]]RM Psyllium.'}
        self.assertEqual(content.check_glossary(src, {'a.say': 'यह है [[x]]RM Psyllium।'}), [])
        probs = content.check_glossary(src, {'a.say': 'यह है आरएम सिलियम।'})
        self.assertTrue(any('RM Psyllium' in p for p in probs))
        self.assertTrue(any('cue' in p for p in probs))

class Script(unittest.TestCase):
    def test_cues(self):
        clean, cues = content.strip_cues('About [[n]]eighty percent.')
        self.assertEqual(clean, 'About eighty percent.')
        self.assertEqual(cues, [('n', 6)])

    def test_brand_signoff_default_on(self):
        s = content.load_script(EXAMPLE)
        self.assertEqual(s['signoff']['name'], 'RM Psyllium')
        self.assertEqual(s['signoff']['name_spoken'], 'R M Psyllium')
        self.assertTrue(s['signoff']['tagline'])
        strings = content.collect_strings(s)
        self.assertIn('signoff.tagline', strings)
        self.assertNotIn('signoff.name', strings)      # the name is never translated
        self.assertTrue(s['endcard']['cta'] and s['endcard']['url'] == 'rmpsyllium.com')

    def test_names_not_translatable(self):
        s = content.load_script(EXAMPLE)
        self.assertFalse(any(k.endswith('.name') for k in content.collect_strings(s)))

class Lexicon(unittest.TestCase):
    def test_spoken_display_map(self):
        disp = 'in Sidhpur, Gujarat. This is RM Psyllium.'
        sp, sp2d, _ = tts.apply_lexicon(disp, 'en')
        self.assertIn('Sidpoor', sp)
        self.assertIn('R M Psyllium', sp)
        i = sp.index('Sidpoor')
        self.assertEqual(disp[sp2d[i]:sp2d[i] + 7], 'Sidhpur')

class Text(unittest.TestCase):
    def test_cjk_tokens(self):
        self.assertEqual([w for w, _ in tokenize('印度。RM Psyllium', 'zh')][:2], ['印', '度。'])

    def test_rtl_keeps_latin_runs(self):
        tb = TextBlock('من الهند RM Psyllium', 'sans', 60, lang='ar', max_w=2000)
        x = {it[0]: it[1] for it in tb.items}
        self.assertLess(x['RM'], x['Psyllium'])          # Latin run stays left-to-right
        self.assertGreater(x['من'], x['الهند'])          # Arabic flows right-to-left

if __name__ == '__main__':
    unittest.main()
