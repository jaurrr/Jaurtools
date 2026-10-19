import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, Routes } from '@angular/router';

import { Lang, TranslateService } from './core/translate.service';

const LANGS: readonly Lang[] = ['en', 'hi', 'ar'];

export const langGuard: CanActivateFn = async (route: ActivatedRouteSnapshot) => {
  const router = inject(Router);
  const translate = inject(TranslateService);
  const lang = route.paramMap.get('lang');

  if (lang && (LANGS as readonly string[]).includes(lang)) {
    const next = lang as Lang;
    if (translate.lang() !== next) await translate.setLang(next);
    return true;
  }
  return router.createUrlTree(['/en']);
};

export const routes: Routes = [
  { path: '', redirectTo: '/en', pathMatch: 'full' },
  {
    path: ':lang',
    canActivate: [langGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/home/home.component').then((m) => m.HomeComponent) },
      { path: 'search', loadComponent: () => import('./pages/search/search.component').then((m) => m.SearchComponent) },
      { path: 'about', loadComponent: () => import('./pages/about/about.component').then((m) => m.AboutComponent) },
      { path: 'contact', loadComponent: () => import('./pages/contact/contact.component').then((m) => m.ContactComponent) },
      {
        path: 'privacy-policy',
        loadComponent: () => import('./pages/privacy-policy/privacy-policy.component').then((m) => m.PrivacyPolicyComponent),
      },
      {
        path: 'terms-of-service',
        loadComponent: () => import('./pages/terms-of-service/terms-of-service.component').then((m) => m.TermsOfServiceComponent),
      },
      {
        path: 'disclaimer',
        loadComponent: () => import('./pages/disclaimer/disclaimer.component').then((m) => m.DisclaimerComponent),
      },
      {
        path: 'sip-calculator',
        loadComponent: () => import('./pages/sip-calculator/sip-calculator.component').then((m) => m.SipCalculatorComponent),
      },
      {
        path: 'emi-calculator',
        loadComponent: () => import('./pages/emi-calculator/emi-calculator.component').then((m) => m.EmiCalculatorComponent),
      },
      {
        path: 'bmi-calculator',
        loadComponent: () => import('./pages/bmi-calculator/bmi-calculator.component').then((m) => m.BmiCalculatorComponent),
      },
      {
        path: 'age-calculator',
        loadComponent: () => import('./pages/age-calculator/age-calculator.component').then((m) => m.AgeCalculatorComponent),
      },
      {
        path: 'qr-code-generator',
        loadComponent: () => import('./pages/qr-code-generator/qr-code-generator.component').then((m) => m.QrCodeGeneratorComponent),
      },
      {
        path: 'password-generator',
        loadComponent: () => import('./pages/password-generator/password-generator.component').then((m) => m.PasswordGeneratorComponent),
      },
      {
        path: 'word-counter',
        loadComponent: () => import('./pages/word-counter/word-counter.component').then((m) => m.WordCounterComponent),
      },
      {
        path: 'unit-converter',
        loadComponent: () => import('./pages/unit-converter/unit-converter.component').then((m) => m.UnitConverterComponent),
      },
      {
        path: 'percentage-calculator',
        loadComponent: () =>
          import('./pages/percentage-calculator/percentage-calculator.component').then((m) => m.PercentageCalculatorComponent),
      },
      {
        path: 'loan-calculator',
        loadComponent: () => import('./pages/loan-calculator/loan-calculator.component').then((m) => m.LoanCalculatorComponent),
      },
      {
        path: '401k-calculator',
        loadComponent: () => import('./pages/401k-calculator/401k-calculator.component').then((m) => m.Retirement401kCalculatorComponent),
      },
      {
        path: 'aadhaar-validator',
        loadComponent: () => import('./pages/aadhaar-validator/aadhaar-validator.component').then((m) => m.AadhaarValidatorComponent),
      },
      {
        path: 'photo-border-maker',
        loadComponent: () => import('./pages/photo-border-maker/photo-border-maker.component').then((m) => m.PhotoBorderMakerComponent),
      },
      {
        path: 'film-grain-effect',
        loadComponent: () => import('./pages/film-grain-effect/film-grain-effect.component').then((m) => m.FilmGrainEffectComponent),
      },
      {
        path: 'add-page-numbers-to-pdf',
        loadComponent: () => import('./pages/add-page-numbers-to-pdf/add-page-numbers-to-pdf.component').then((m) => m.AddPageNumbersToPdfComponent),
      },
      {
        path: 'text-on-photo',
        loadComponent: () => import('./pages/text-on-photo/text-on-photo.component').then((m) => m.TextOnPhotoComponent),
      },
      {
        path: 'add-text-to-each-line',
        loadComponent: () => import('./pages/add-text-to-each-line/add-text-to-each-line.component').then((m) => m.AddTextToEachLineComponent),
      },
      {
        path: 'add-text-to-pdf',
        loadComponent: () => import('./pages/add-text-to-pdf/add-text-to-pdf.component').then((m) => m.AddTextToPdfComponent),
      },
      {
        path: 'add-to-a-date',
        loadComponent: () => import('./pages/add-to-a-date/add-to-a-date.component').then((m) => m.AddToADateComponent),
      },
      {
        path: 'photo-color-adjuster',
        loadComponent: () => import('./pages/photo-color-adjuster/photo-color-adjuster.component').then((m) => m.PhotoColorAdjusterComponent),
      },
      {
        path: 'aes-256-gcm-encrypt-decrypt',
        loadComponent: () => import('./pages/aes-256-gcm-encrypt-decrypt/aes-256-gcm-encrypt-decrypt.component').then((m) => m.Aes256GcmEncryptDecryptComponent),
      },
      {
        path: 'age-difference-calculator',
        loadComponent: () => import('./pages/age-difference-calculator/age-difference-calculator.component').then((m) => m.AgeDifferenceCalculatorComponent),
      },
      {
        path: 'amortization-calculator',
        loadComponent: () => import('./pages/amortization-calculator/amortization-calculator.component').then((m) => m.AmortizationCalculatorComponent),
      },
      {
        path: 'analogous-color-scheme',
        loadComponent: () => import('./pages/analogous-color-scheme/analogous-color-scheme.component').then((m) => m.AnalogousColorSchemeComponent),
      },
      {
        path: 'annotate-pdf',
        loadComponent: () => import('./pages/annotate-pdf/annotate-pdf.component').then((m) => m.AnnotatePdfComponent),
      },
      {
        path: 'annuity-calculator',
        loadComponent: () => import('./pages/annuity-calculator/annuity-calculator.component').then((m) => m.AnnuityCalculatorComponent),
      },
      {
        path: 'annuity-payout-calculator',
        loadComponent: () => import('./pages/annuity-payout-calculator/annuity-payout-calculator.component').then((m) => m.AnnuityPayoutCalculatorComponent),
      },
      {
        path: 'application-letter-writer',
        loadComponent: () => import('./pages/application-letter-writer/application-letter-writer.component').then((m) => m.ApplicationLetterWriterComponent),
      },
      {
        path: 'apr-calculator',
        loadComponent: () => import('./pages/apr-calculator/apr-calculator.component').then((m) => m.AprCalculatorComponent),
      },
      {
        path: 'apy-calculator',
        loadComponent: () => import('./pages/apy-calculator/apy-calculator.component').then((m) => m.ApyCalculatorComponent),
      },
      {
        path: 'area-calculator',
        loadComponent: () => import('./pages/area-calculator/area-calculator.component').then((m) => m.AreaCalculatorComponent),
      },
      {
        path: 'area-converter',
        loadComponent: () => import('./pages/area-converter/area-converter.component').then((m) => m.AreaConverterComponent),
      },
      {
        path: 'army-body-fat-calculator',
        loadComponent: () => import('./pages/army-body-fat-calculator/army-body-fat-calculator.component').then((m) => m.ArmyBodyFatCalculatorComponent),
      },
      {
        path: 'ascii-art-generator',
        loadComponent: () => import('./pages/ascii-art-generator/ascii-art-generator.component').then((m) => m.AsciiArtGeneratorComponent),
      },
      {
        path: 'ascii-table',
        loadComponent: () => import('./pages/ascii-table/ascii-table.component').then((m) => m.AsciiTableComponent),
      },
      {
        path: 'attendance-percentage-calculator',
        loadComponent: () => import('./pages/attendance-percentage-calculator/attendance-percentage-calculator.component').then((m) => m.AttendancePercentageCalculatorComponent),
      },
      {
        path: 'auto-lease-calculator',
        loadComponent: () => import('./pages/auto-lease-calculator/auto-lease-calculator.component').then((m) => m.AutoLeaseCalculatorComponent),
      },
      {
        path: 'auto-loan-calculator',
        loadComponent: () => import('./pages/auto-loan-calculator/auto-loan-calculator.component').then((m) => m.AutoLoanCalculatorComponent),
      },
      {
        path: 'average-calculator',
        loadComponent: () => import('./pages/average-calculator/average-calculator.component').then((m) => m.AverageCalculatorComponent),
      },
      {
        path: 'average-return-calculator',
        loadComponent: () => import('./pages/average-return-calculator/average-return-calculator.component').then((m) => m.AverageReturnCalculatorComponent),
      },
      {
        path: 'award-certificate-generator',
        loadComponent: () => import('./pages/award-certificate-generator/award-certificate-generator.component').then((m) => m.AwardCertificateGeneratorComponent),
      },
      {
        path: 'bac-calculator',
        loadComponent: () => import('./pages/bac-calculator/bac-calculator.component').then((m) => m.BacCalculatorComponent),
      },
      {
        path: 'bandwidth-calculator',
        loadComponent: () => import('./pages/bandwidth-calculator/bandwidth-calculator.component').then((m) => m.BandwidthCalculatorComponent),
      },
      {
        path: 'barcode-generator',
        loadComponent: () => import('./pages/barcode-generator/barcode-generator.component').then((m) => m.BarcodeGeneratorComponent),
      },
      {
        path: 'base64-encoder-decoder',
        loadComponent: () => import('./pages/base64-encoder-decoder/base64-encoder-decoder.component').then((m) => m.Base64EncoderDecoderComponent),
      },
      {
        path: 'online-calculator',
        loadComponent: () => import('./pages/online-calculator/online-calculator.component').then((m) => m.OnlineCalculatorComponent),
      },
      {
        path: 'pdf-editor',
        loadComponent: () => import('./pages/pdf-editor/pdf-editor.component').then((m) => m.PdfEditorComponent),
      },
      {
        path: 'bcrypt-hash-generator',
        loadComponent: () => import('./pages/bcrypt-hash-generator/bcrypt-hash-generator.component').then((m) => m.BcryptHashGeneratorComponent),
      },
      {
        path: 'big-number-calculator',
        loadComponent: () => import('./pages/big-number-calculator/big-number-calculator.component').then((m) => m.BigNumberCalculatorComponent),
      },
      {
        path: 'bimi-svg-validator',
        loadComponent: () => import('./pages/bimi-svg-validator/bimi-svg-validator.component').then((m) => m.BimiSvgValidatorComponent),
      },
      {
        path: 'binary-calculator',
        loadComponent: () => import('./pages/binary-calculator/binary-calculator.component').then((m) => m.BinaryCalculatorComponent),
      },
      {
        path: 'binary-to-text-converter',
        loadComponent: () => import('./pages/binary-to-text-converter/binary-to-text-converter.component').then((m) => m.BinaryToTextConverterComponent),
      },
      {
        path: 'biodata-maker',
        loadComponent: () => import('./pages/biodata-maker/biodata-maker.component').then((m) => m.BiodataMakerComponent),
      },
      {
        path: 'bionic-reading-converter',
        loadComponent: () => import('./pages/bionic-reading-converter/bionic-reading-converter.component').then((m) => m.BionicReadingConverterComponent),
      },
      {
        path: 'birthday-calculator',
        loadComponent: () => import('./pages/birthday-calculator/birthday-calculator.component').then((m) => m.BirthdayCalculatorComponent),
      },
      {
        path: 'color-blender',
        loadComponent: () => import('./pages/color-blender/color-blender.component').then((m) => m.ColorBlenderComponent),
      },
      {
        path: 'photo-blur',
        loadComponent: () => import('./pages/photo-blur/photo-blur.component').then((m) => m.PhotoBlurComponent),
      },
      {
        path: 'blurred-frame-maker',
        loadComponent: () => import('./pages/blurred-frame-maker/blurred-frame-maker.component').then((m) => m.BlurredFrameMakerComponent),
      },
      {
        path: 'bmr-calculator',
        loadComponent: () => import('./pages/bmr-calculator/bmr-calculator.component').then((m) => m.BmrCalculatorComponent),
      },
      {
        path: 'boat-loan-calculator',
        loadComponent: () => import('./pages/boat-loan-calculator/boat-loan-calculator.component').then((m) => m.BoatLoanCalculatorComponent),
      },
      {
        path: 'body-surface-area-calculator',
        loadComponent: () => import('./pages/body-surface-area-calculator/body-surface-area-calculator.component').then((m) => m.BodySurfaceAreaCalculatorComponent),
      },
      {
        path: 'body-type-calculator',
        loadComponent: () => import('./pages/body-type-calculator/body-type-calculator.component').then((m) => m.BodyTypeCalculatorComponent),
      },
      {
        path: 'bond-calculator',
        loadComponent: () => import('./pages/bond-calculator/bond-calculator.component').then((m) => m.BondCalculatorComponent),
      },
      {
        path: 'bra-size-calculator',
        loadComponent: () => import('./pages/bra-size-calculator/bra-size-calculator.component').then((m) => m.BraSizeCalculatorComponent),
      },
      {
        path: 'break-even-point-calculator',
        loadComponent: () => import('./pages/break-even-point-calculator/break-even-point-calculator.component').then((m) => m.BreakEvenPointCalculatorComponent),
      },
      {
        path: 'brightness-contrast-adjuster',
        loadComponent: () => import('./pages/brightness-contrast-adjuster/brightness-contrast-adjuster.component').then((m) => m.BrightnessContrastAdjusterComponent),
      },
      {
        path: 'btu-calculator',
        loadComponent: () => import('./pages/btu-calculator/btu-calculator.component').then((m) => m.BtuCalculatorComponent),
      },
      {
        path: 'budget-calculator',
        loadComponent: () => import('./pages/budget-calculator/budget-calculator.component').then((m) => m.BudgetCalculatorComponent),
      },
      {
        path: 'bulk-image-resizer',
        loadComponent: () => import('./pages/bulk-image-resizer/bulk-image-resizer.component').then((m) => m.BulkImageResizerComponent),
      },
      {
        path: 'bulk-qr-code-generator',
        loadComponent: () => import('./pages/bulk-qr-code-generator/bulk-qr-code-generator.component').then((m) => m.BulkQrCodeGeneratorComponent),
      },
      {
        path: 'business-card-maker',
        loadComponent: () => import('./pages/business-card-maker/business-card-maker.component').then((m) => m.BusinessCardMakerComponent),
      },
      {
        path: 'business-loan-calculator',
        loadComponent: () => import('./pages/business-loan-calculator/business-loan-calculator.component').then((m) => m.BusinessLoanCalculatorComponent),
      },
      {
        path: 'byte-size-calculator',
        loadComponent: () => import('./pages/byte-size-calculator/byte-size-calculator.component').then((m) => m.ByteSizeCalculatorComponent),
      },
      {
        path: 'cagr-calculator',
        loadComponent: () => import('./pages/cagr-calculator/cagr-calculator.component').then((m) => m.CagrCalculatorComponent),
      },
      {
        path: 'calories-burned-calculator',
        loadComponent: () => import('./pages/calories-burned-calculator/calories-burned-calculator.component').then((m) => m.CaloriesBurnedCalculatorComponent),
      },
      {
        path: 'canadian-mortgage-calculator',
        loadComponent: () => import('./pages/canadian-mortgage-calculator/canadian-mortgage-calculator.component').then((m) => m.CanadianMortgageCalculatorComponent),
      },
      {
        path: 'carbohydrate-calculator',
        loadComponent: () => import('./pages/carbohydrate-calculator/carbohydrate-calculator.component').then((m) => m.CarbohydrateCalculatorComponent),
      },
      {
        path: 'case-converter',
        loadComponent: () => import('./pages/case-converter/case-converter.component').then((m) => m.CaseConverterComponent),
      },
      {
        path: 'cash-back-calculator',
        loadComponent: () => import('./pages/cash-back-calculator/cash-back-calculator.component').then((m) => m.CashBackCalculatorComponent),
      },
      {
        path: 'cash-back-vs-low-interest-calculator',
        loadComponent: () => import('./pages/cash-back-vs-low-interest-calculator/cash-back-vs-low-interest-calculator.component').then((m) => m.CashBackVsLowInterestCalculatorComponent),
      },
      {
        path: 'cbm-calculator',
        loadComponent: () => import('./pages/cbm-calculator/cbm-calculator.component').then((m) => m.CbmCalculatorComponent),
      },
      {
        path: 'color-saturation-adjuster',
        loadComponent: () => import('./pages/color-saturation-adjuster/color-saturation-adjuster.component').then((m) => m.ColorSaturationAdjusterComponent),
      },
      {
        path: 'chart-maker',
        loadComponent: () => import('./pages/chart-maker/chart-maker.component').then((m) => m.ChartMakerComponent),
      },
      {
        path: 'chmod-calculator',
        loadComponent: () => import('./pages/chmod-calculator/chmod-calculator.component').then((m) => m.ChmodCalculatorComponent),
      },
      {
        path: 'chord-progression-generator',
        loadComponent: () => import('./pages/chord-progression-generator/chord-progression-generator.component').then((m) => m.ChordProgressionGeneratorComponent),
      },
      {
        path: 'circle-calculator',
        loadComponent: () => import('./pages/circle-calculator/circle-calculator.component').then((m) => m.CircleCalculatorComponent),
      },
      {
        path: 'circle-crop',
        loadComponent: () => import('./pages/circle-crop/circle-crop.component').then((m) => m.CircleCropComponent),
      },
      {
        path: 'citation-generator',
        loadComponent: () => import('./pages/citation-generator/citation-generator.component').then((m) => m.CitationGeneratorComponent),
      },
      {
        path: 'shape-cropper',
        loadComponent: () => import('./pages/shape-cropper/shape-cropper.component').then((m) => m.ShapeCropperComponent),
      },
      {
        path: 'cloud-egress-cost-calculator',
        loadComponent: () => import('./pages/cloud-egress-cost-calculator/cloud-egress-cost-calculator.component').then((m) => m.CloudEgressCostCalculatorComponent),
      },
      {
        path: 'code-formatter',
        loadComponent: () => import('./pages/code-formatter/code-formatter.component').then((m) => m.CodeFormatterComponent),
      },
      {
        path: 'code-minifier',
        loadComponent: () => import('./pages/code-minifier/code-minifier.component').then((m) => m.CodeMinifierComponent),
      },
      {
        path: 'code-to-image',
        loadComponent: () => import('./pages/code-to-image/code-to-image.component').then((m) => m.CodeToImageComponent),
      },
      {
        path: 'coin-flip',
        loadComponent: () => import('./pages/coin-flip/coin-flip.component').then((m) => m.CoinFlipComponent),
      },
      {
        path: 'collage-maker',
        loadComponent: () => import('./pages/collage-maker/collage-maker.component').then((m) => m.CollageMakerComponent),
      },
      {
        path: 'college-cost-calculator',
        loadComponent: () => import('./pages/college-cost-calculator/college-cost-calculator.component').then((m) => m.CollegeCostCalculatorComponent),
      },
      {
        path: 'color-code-converter',
        loadComponent: () => import('./pages/color-code-converter/color-code-converter.component').then((m) => m.ColorCodeConverterComponent),
      },
      {
        path: 'color-contrast-checker',
        loadComponent: () => import('./pages/color-contrast-checker/color-contrast-checker.component').then((m) => m.ColorContrastCheckerComponent),
      },
      {
        path: 'color-converter',
        loadComponent: () => import('./pages/color-converter/color-converter.component').then((m) => m.ColorConverterComponent),
      },
      {
        path: 'color-picker',
        loadComponent: () => import('./pages/color-picker/color-picker.component').then((m) => m.ColorPickerComponent),
      },
      {
        path: 'photo-joiner',
        loadComponent: () => import('./pages/photo-joiner/photo-joiner.component').then((m) => m.PhotoJoinerComponent),
      },
      {
        path: 'commission-calculator',
        loadComponent: () => import('./pages/commission-calculator/commission-calculator.component').then((m) => m.CommissionCalculatorComponent),
      },
      {
        path: 'common-factor-calculator',
        loadComponent: () => import('./pages/common-factor-calculator/common-factor-calculator.component').then((m) => m.CommonFactorCalculatorComponent),
      },
      {
        path: 'compare-pdf',
        loadComponent: () => import('./pages/compare-pdf/compare-pdf.component').then((m) => m.ComparePdfComponent),
      },
      {
        path: 'complementary-color',
        loadComponent: () => import('./pages/complementary-color/complementary-color.component').then((m) => m.ComplementaryColorComponent),
      },
      {
        path: 'compound-interest-calculator',
        loadComponent: () => import('./pages/compound-interest-calculator/compound-interest-calculator.component').then((m) => m.CompoundInterestCalculatorComponent),
      },
      {
        path: 'compress-pdf',
        loadComponent: () => import('./pages/compress-pdf/compress-pdf.component').then((m) => m.CompressPdfComponent),
      },
      {
        path: 'conception-calculator',
        loadComponent: () => import('./pages/conception-calculator/conception-calculator.component').then((m) => m.ConceptionCalculatorComponent),
      },
      {
        path: 'concrete-calculator',
        loadComponent: () => import('./pages/concrete-calculator/concrete-calculator.component').then((m) => m.ConcreteCalculatorComponent),
      },
      {
        path: 'confidence-interval-calculator',
        loadComponent: () => import('./pages/confidence-interval-calculator/confidence-interval-calculator.component').then((m) => m.ConfidenceIntervalCalculatorComponent),
      },
      {
        path: 'connection-test',
        loadComponent: () => import('./pages/connection-test/connection-test.component').then((m) => m.ConnectionTestComponent),
      },
      {
        path: 'line-counter',
        loadComponent: () => import('./pages/line-counter/line-counter.component').then((m) => m.LineCounterComponent),
      },
      {
        path: 'cpm-cpc-cpa-calculator',
        loadComponent: () => import('./pages/cpm-cpc-cpa-calculator/cpm-cpc-cpa-calculator.component').then((m) => m.CpmCpcCpaCalculatorComponent),
      },
      {
        path: 'create-pdf',
        loadComponent: () => import('./pages/create-pdf/create-pdf.component').then((m) => m.CreatePdfComponent),
      },
      {
        path: 'create-zip',
        loadComponent: () => import('./pages/create-zip/create-zip.component').then((m) => m.CreateZipComponent),
      },
      {
        path: 'credit-card-payoff-calculator',
        loadComponent: () => import('./pages/credit-card-payoff-calculator/credit-card-payoff-calculator.component').then((m) => m.CreditCardPayoffCalculatorComponent),
      },
      {
        path: 'cron-builder',
        loadComponent: () => import('./pages/cron-builder/cron-builder.component').then((m) => m.CronBuilderComponent),
      },
      {
        path: 'cron-parser',
        loadComponent: () => import('./pages/cron-parser/cron-parser.component').then((m) => m.CronParserComponent),
      },
      {
        path: 'image-cropper',
        loadComponent: () => import('./pages/image-cropper/image-cropper.component').then((m) => m.ImageCropperComponent),
      },
      {
        path: 'crop-pdf',
        loadComponent: () => import('./pages/crop-pdf/crop-pdf.component').then((m) => m.CropPdfComponent),
      },
      {
        path: 'csp-generator',
        loadComponent: () => import('./pages/csp-generator/csp-generator.component').then((m) => m.CspGeneratorComponent),
      },
      {
        path: 'css-background-pattern-generator',
        loadComponent: () => import('./pages/css-background-pattern-generator/css-background-pattern-generator.component').then((m) => m.CssBackgroundPatternGeneratorComponent),
      },
      {
        path: 'css-border-radius-generator',
        loadComponent: () => import('./pages/css-border-radius-generator/css-border-radius-generator.component').then((m) => m.CssBorderRadiusGeneratorComponent),
      },
      {
        path: 'css-box-shadow-generator',
        loadComponent: () => import('./pages/css-box-shadow-generator/css-box-shadow-generator.component').then((m) => m.CssBoxShadowGeneratorComponent),
      },
      {
        path: 'css-checkbox-generator',
        loadComponent: () => import('./pages/css-checkbox-generator/css-checkbox-generator.component').then((m) => m.CssCheckboxGeneratorComponent),
      },
      {
        path: 'css-clip-path-generator',
        loadComponent: () => import('./pages/css-clip-path-generator/css-clip-path-generator.component').then((m) => m.CssClipPathGeneratorComponent),
      },
      {
        path: 'css-cubic-bezier-generator',
        loadComponent: () => import('./pages/css-cubic-bezier-generator/css-cubic-bezier-generator.component').then((m) => m.CssCubicBezierGeneratorComponent),
      },
      {
        path: 'css-glassmorphism-generator',
        loadComponent: () => import('./pages/css-glassmorphism-generator/css-glassmorphism-generator.component').then((m) => m.CssGlassmorphismGeneratorComponent),
      },
      {
        path: 'css-gradient-generator',
        loadComponent: () => import('./pages/css-gradient-generator/css-gradient-generator.component').then((m) => m.CssGradientGeneratorComponent),
      },
      {
        path: 'css-inliner',
        loadComponent: () => import('./pages/css-inliner/css-inliner.component').then((m) => m.CssInlinerComponent),
      },
      {
        path: 'css-loader-generator',
        loadComponent: () => import('./pages/css-loader-generator/css-loader-generator.component').then((m) => m.CssLoaderGeneratorComponent),
      },
      {
        path: 'css-switch-generator',
        loadComponent: () => import('./pages/css-switch-generator/css-switch-generator.component').then((m) => m.CssSwitchGeneratorComponent),
      },
      {
        path: 'css-text-glitch-generator',
        loadComponent: () => import('./pages/css-text-glitch-generator/css-text-glitch-generator.component').then((m) => m.CssTextGlitchGeneratorComponent),
      },
      {
        path: 'css-triangle-generator',
        loadComponent: () => import('./pages/css-triangle-generator/css-triangle-generator.component').then((m) => m.CssTriangleGeneratorComponent),
      },
      {
        path: 'css-unit-converter',
        loadComponent: () => import('./pages/css-unit-converter/css-unit-converter.component').then((m) => m.CssUnitConverterComponent),
      },
      {
        path: 'csv-formatter',
        loadComponent: () => import('./pages/csv-formatter/csv-formatter.component').then((m) => m.CsvFormatterComponent),
      },
      {
        path: 'csv-to-excel',
        loadComponent: () => import('./pages/csv-to-excel/csv-to-excel.component').then((m) => m.CsvToExcelComponent),
      },
      {
        path: 'csv-to-json',
        loadComponent: () => import('./pages/csv-to-json/csv-to-json.component').then((m) => m.CsvToJsonComponent),
      },
      {
        path: 'csv-to-xml',
        loadComponent: () => import('./pages/csv-to-xml/csv-to-xml.component').then((m) => m.CsvToXmlComponent),
      },
      {
        path: 'cubic-feet-calculator',
        loadComponent: () => import('./pages/cubic-feet-calculator/cubic-feet-calculator.component').then((m) => m.CubicFeetCalculatorComponent),
      },
      {
        path: 'curl-fetch-axios-converter',
        loadComponent: () => import('./pages/curl-fetch-axios-converter/curl-fetch-axios-converter.component').then((m) => m.CurlFetchAxiosConverterComponent),
      },
      {
        path: 'data-storage-converter',
        loadComponent: () => import('./pages/data-storage-converter/data-storage-converter.component').then((m) => m.DataStorageConverterComponent),
      },
      {
        path: 'date-calculator',
        loadComponent: () => import('./pages/date-calculator/date-calculator.component').then((m) => m.DateCalculatorComponent),
      },
      {
        path: 'day-of-week-finder',
        loadComponent: () => import('./pages/day-of-week-finder/day-of-week-finder.component').then((m) => m.DayOfWeekFinderComponent),
      },
      {
        path: 'days-between-dates',
        loadComponent: () => import('./pages/days-between-dates/days-between-dates.component').then((m) => m.DaysBetweenDatesComponent),
      },
      {
        path: 'days-from-today',
        loadComponent: () => import('./pages/days-from-today/days-from-today.component').then((m) => m.DaysFromTodayComponent),
      },
      {
        path: 'debt-consolidation-calculator',
        loadComponent: () => import('./pages/debt-consolidation-calculator/debt-consolidation-calculator.component').then((m) => m.DebtConsolidationCalculatorComponent),
      },
      {
        path: 'debt-payoff-calculator',
        loadComponent: () => import('./pages/debt-payoff-calculator/debt-payoff-calculator.component').then((m) => m.DebtPayoffCalculatorComponent),
      },
      {
        path: 'debt-ratio-calculator',
        loadComponent: () => import('./pages/debt-ratio-calculator/debt-ratio-calculator.component').then((m) => m.DebtRatioCalculatorComponent),
      },
      {
        path: 'debt-to-income-ratio-calculator',
        loadComponent: () => import('./pages/debt-to-income-ratio-calculator/debt-to-income-ratio-calculator.component').then((m) => m.DebtToIncomeRatioCalculatorComponent),
      },
      {
        path: 'decimal-to-fraction-calculator',
        loadComponent: () => import('./pages/decimal-to-fraction-calculator/decimal-to-fraction-calculator.component').then((m) => m.DecimalToFractionCalculatorComponent),
      },
      {
        path: 'spin-the-wheel',
        loadComponent: () => import('./pages/spin-the-wheel/spin-the-wheel.component').then((m) => m.SpinTheWheelComponent),
      },
      {
        path: 'delete-pdf-pages',
        loadComponent: () => import('./pages/delete-pdf-pages/delete-pdf-pages.component').then((m) => m.DeletePdfPagesComponent),
      },
      {
        path: 'density-calculator',
        loadComponent: () => import('./pages/density-calculator/density-calculator.component').then((m) => m.DensityCalculatorComponent),
      },
      {
        path: 'depreciation-calculator',
        loadComponent: () => import('./pages/depreciation-calculator/depreciation-calculator.component').then((m) => m.DepreciationCalculatorComponent),
      },
      {
        path: 'device-test',
        loadComponent: () => import('./pages/device-test/device-test.component').then((m) => m.DeviceTestComponent),
      },
      {
        path: 'dew-point-calculator',
        loadComponent: () => import('./pages/dew-point-calculator/dew-point-calculator.component').then((m) => m.DewPointCalculatorComponent),
      },
      {
        path: 'dice-roller',
        loadComponent: () => import('./pages/dice-roller/dice-roller.component').then((m) => m.DiceRollerComponent),
      },
      {
        path: 'discount-calculator',
        loadComponent: () => import('./pages/discount-calculator/discount-calculator.component').then((m) => m.DiscountCalculatorComponent),
      },
      {
        path: 'distance-between-coordinates',
        loadComponent: () => import('./pages/distance-between-coordinates/distance-between-coordinates.component').then((m) => m.DistanceBetweenCoordinatesComponent),
      },
      {
        path: 'distance-calculator',
        loadComponent: () => import('./pages/distance-calculator/distance-calculator.component').then((m) => m.DistanceCalculatorComponent),
      },
      {
        path: 'dividend-yield-calculator',
        loadComponent: () => import('./pages/dividend-yield-calculator/dividend-yield-calculator.component').then((m) => m.DividendYieldCalculatorComponent),
      },
      {
        path: 'dmarc-record-generator',
        loadComponent: () => import('./pages/dmarc-record-generator/dmarc-record-generator.component').then((m) => m.DmarcRecordGeneratorComponent),
      },
      {
        path: 'dmarc-xml-report-analyzer',
        loadComponent: () => import('./pages/dmarc-xml-report-analyzer/dmarc-xml-report-analyzer.component').then((m) => m.DmarcXmlReportAnalyzerComponent),
      },
      {
        path: 'docker-compose-generator',
        loadComponent: () => import('./pages/docker-compose-generator/docker-compose-generator.component').then((m) => m.DockerComposeGeneratorComponent),
      },
      {
        path: 'docker-compose-k8s-converter',
        loadComponent: () => import('./pages/docker-compose-k8s-converter/docker-compose-k8s-converter.component').then((m) => m.DockerComposeK8sConverterComponent),
      },
      {
        path: 'docker-run-compose-converter',
        loadComponent: () => import('./pages/docker-run-compose-converter/docker-run-compose-converter.component').then((m) => m.DockerRunComposeConverterComponent),
      },
      {
        path: 'down-payment-calculator',
        loadComponent: () => import('./pages/down-payment-calculator/down-payment-calculator.component').then((m) => m.DownPaymentCalculatorComponent),
      },
      {
        path: 'drawing-board',
        loadComponent: () => import('./pages/drawing-board/drawing-board.component').then((m) => m.DrawingBoardComponent),
      },
      {
        path: 'duotone-effect',
        loadComponent: () => import('./pages/duotone-effect/duotone-effect.component').then((m) => m.DuotoneEffectComponent),
      },
      {
        path: 'ear-training',
        loadComponent: () => import('./pages/ear-training/ear-training.component').then((m) => m.EarTrainingComponent),
      },
      {
        path: 'edge-detection',
        loadComponent: () => import('./pages/edge-detection/edge-detection.component').then((m) => m.EdgeDetectionComponent),
      },
      {
        path: 'edit-pdf',
        loadComponent: () => import('./pages/edit-pdf/edit-pdf.component').then((m) => m.EditPdfComponent),
      },
      {
        path: 'electricity-cost-calculator',
        loadComponent: () => import('./pages/electricity-cost-calculator/electricity-cost-calculator.component').then((m) => m.ElectricityCostCalculatorComponent),
      },
      {
        path: 'email-address-encoder',
        loadComponent: () => import('./pages/email-address-encoder/email-address-encoder.component').then((m) => m.EmailAddressEncoderComponent),
      },
      {
        path: 'email-header-analyzer',
        loadComponent: () => import('./pages/email-header-analyzer/email-header-analyzer.component').then((m) => m.EmailHeaderAnalyzerComponent),
      },
      {
        path: 'email-signature-generator',
        loadComponent: () => import('./pages/email-signature-generator/email-signature-generator.component').then((m) => m.EmailSignatureGeneratorComponent),
      },
      {
        path: 'emboss-effect',
        loadComponent: () => import('./pages/emboss-effect/emboss-effect.component').then((m) => m.EmbossEffectComponent),
      },
      {
        path: 'emergency-contact-card-maker',
        loadComponent: () => import('./pages/emergency-contact-card-maker/emergency-contact-card-maker.component').then((m) => m.EmergencyContactCardMakerComponent),
      },
      {
        path: 'emoji-library',
        loadComponent: () => import('./pages/emoji-library/emoji-library.component').then((m) => m.EmojiLibraryComponent),
      },
      {
        path: 'energy-converter',
        loadComponent: () => import('./pages/energy-converter/energy-converter.component').then((m) => m.EnergyConverterComponent),
      },
      {
        path: 'epoch-converter',
        loadComponent: () => import('./pages/epoch-converter/epoch-converter.component').then((m) => m.EpochConverterComponent),
      },
      {
        path: 'photo-equalizer',
        loadComponent: () => import('./pages/photo-equalizer/photo-equalizer.component').then((m) => m.PhotoEqualizerComponent),
      },
      {
        path: 'estate-tax-calculator',
        loadComponent: () => import('./pages/estate-tax-calculator/estate-tax-calculator.component').then((m) => m.EstateTaxCalculatorComponent),
      },
      {
        path: 'excel-to-csv',
        loadComponent: () => import('./pages/excel-to-csv/excel-to-csv.component').then((m) => m.ExcelToCsvComponent),
      },
      {
        path: 'excel-to-xml',
        loadComponent: () => import('./pages/excel-to-xml/excel-to-xml.component').then((m) => m.ExcelToXmlComponent),
      },
      {
        path: 'exif-viewer',
        loadComponent: () => import('./pages/exif-viewer/exif-viewer.component').then((m) => m.ExifViewerComponent),
      },
      {
        path: 'exponent-calculator',
        loadComponent: () => import('./pages/exponent-calculator/exponent-calculator.component').then((m) => m.ExponentCalculatorComponent),
      },
      {
        path: 'extract-images-from-pdf',
        loadComponent: () => import('./pages/extract-images-from-pdf/extract-images-from-pdf.component').then((m) => m.ExtractImagesFromPdfComponent),
      },
      {
        path: 'factor-calculator',
        loadComponent: () => import('./pages/factor-calculator/factor-calculator.component').then((m) => m.FactorCalculatorComponent),
      },
      {
        path: 'fancy-text-generator',
        loadComponent: () => import('./pages/fancy-text-generator/fancy-text-generator.component').then((m) => m.FancyTextGeneratorComponent),
      },
      {
        path: 'faq-schema-builder',
        loadComponent: () => import('./pages/faq-schema-builder/faq-schema-builder.component').then((m) => m.FaqSchemaBuilderComponent),
      },
      {
        path: 'fat-intake-calculator',
        loadComponent: () => import('./pages/fat-intake-calculator/fat-intake-calculator.component').then((m) => m.FatIntakeCalculatorComponent),
      },
      {
        path: 'favicon-generator',
        loadComponent: () => import('./pages/favicon-generator/favicon-generator.component').then((m) => m.FaviconGeneratorComponent),
      },
      {
        path: 'fha-loan-calculator',
        loadComponent: () => import('./pages/fha-loan-calculator/fha-loan-calculator.component').then((m) => m.FhaLoanCalculatorComponent),
      },
      {
        path: 'file-size-converter',
        loadComponent: () => import('./pages/file-size-converter/file-size-converter.component').then((m) => m.FileSizeConverterComponent),
      },
      {
        path: 'filter-numbers',
        loadComponent: () => import('./pages/filter-numbers/filter-numbers.component').then((m) => m.FilterNumbersComponent),
      },
      {
        path: 'final-grade-calculator',
        loadComponent: () => import('./pages/final-grade-calculator/final-grade-calculator.component').then((m) => m.FinalGradeCalculatorComponent),
      },
      {
        path: 'finance-calculator',
        loadComponent: () => import('./pages/finance-calculator/finance-calculator.component').then((m) => m.FinanceCalculatorComponent),
      },
      {
        path: 'find-and-replace',
        loadComponent: () => import('./pages/find-and-replace/find-and-replace.component').then((m) => m.FindAndReplaceComponent),
      },
      {
        path: 'fixed-deposit-calculator',
        loadComponent: () => import('./pages/fixed-deposit-calculator/fixed-deposit-calculator.component').then((m) => m.FixedDepositCalculatorComponent),
      },
      {
        path: 'flexbox-playground',
        loadComponent: () => import('./pages/flexbox-playground/flexbox-playground.component').then((m) => m.FlexboxPlaygroundComponent),
      },
      {
        path: 'rotate-flip-photo',
        loadComponent: () => import('./pages/rotate-flip-photo/rotate-flip-photo.component').then((m) => m.RotateFlipPhotoComponent),
      },
      {
        path: 'flooring-calculator',
        loadComponent: () => import('./pages/flooring-calculator/flooring-calculator.component').then((m) => m.FlooringCalculatorComponent),
      },
      {
        path: 'flyer-maker',
        loadComponent: () => import('./pages/flyer-maker/flyer-maker.component').then((m) => m.FlyerMakerComponent),
      },
      {
        path: 'icon-to-png-converter',
        loadComponent: () => import('./pages/icon-to-png-converter/icon-to-png-converter.component').then((m) => m.IconToPngConverterComponent),
      },
      {
        path: 'font-pair-finder',
        loadComponent: () => import('./pages/font-pair-finder/font-pair-finder.component').then((m) => m.FontPairFinderComponent),
      },
      {
        path: 'forex-compounding-calculator',
        loadComponent: () => import('./pages/forex-compounding-calculator/forex-compounding-calculator.component').then((m) => m.ForexCompoundingCalculatorComponent),
      },
      {
        path: 'fraction-calculator',
        loadComponent: () => import('./pages/fraction-calculator/fraction-calculator.component').then((m) => m.FractionCalculatorComponent),
      },
      {
        path: 'frequency-converter',
        loadComponent: () => import('./pages/frequency-converter/frequency-converter.component').then((m) => m.FrequencyConverterComponent),
      },
      {
        path: 'fuel-cost-calculator',
        loadComponent: () => import('./pages/fuel-cost-calculator/fuel-cost-calculator.component').then((m) => m.FuelCostCalculatorComponent),
      },
      {
        path: 'fuel-economy-converter',
        loadComponent: () => import('./pages/fuel-economy-converter/fuel-economy-converter.component').then((m) => m.FuelEconomyConverterComponent),
      },
      {
        path: 'fuel-range-calculator',
        loadComponent: () => import('./pages/fuel-range-calculator/fuel-range-calculator.component').then((m) => m.FuelRangeCalculatorComponent),
      },
      {
        path: 'future-value-calculator',
        loadComponent: () => import('./pages/future-value-calculator/future-value-calculator.component').then((m) => m.FutureValueCalculatorComponent),
      },
      {
        path: 'gamepad-tester',
        loadComponent: () => import('./pages/gamepad-tester/gamepad-tester.component').then((m) => m.GamepadTesterComponent),
      },
      {
        path: 'gas-mileage-calculator',
        loadComponent: () => import('./pages/gas-mileage-calculator/gas-mileage-calculator.component').then((m) => m.GasMileageCalculatorComponent),
      },
      {
        path: 'gaussian-random-number-generator',
        loadComponent: () => import('./pages/gaussian-random-number-generator/gaussian-random-number-generator.component').then((m) => m.GaussianRandomNumberGeneratorComponent),
      },
      {
        path: 'gcf-calculator',
        loadComponent: () => import('./pages/gcf-calculator/gcf-calculator.component').then((m) => m.GcfCalculatorComponent),
      },
      {
        path: 'gdp-calculator',
        loadComponent: () => import('./pages/gdp-calculator/gdp-calculator.component').then((m) => m.GdpCalculatorComponent),
      },
      {
        path: 'generate-list-of-numbers',
        loadComponent: () => import('./pages/generate-list-of-numbers/generate-list-of-numbers.component').then((m) => m.GenerateListOfNumbersComponent),
      },
      {
        path: 'gfr-calculator',
        loadComponent: () => import('./pages/gfr-calculator/gfr-calculator.component').then((m) => m.GfrCalculatorComponent),
      },
      {
        path: 'gif-resizer',
        loadComponent: () => import('./pages/gif-resizer/gif-resizer.component').then((m) => m.GifResizerComponent),
      },
      {
        path: 'glow-effect',
        loadComponent: () => import('./pages/glow-effect/glow-effect.component').then((m) => m.GlowEffectComponent),
      },
      {
        path: 'golf-handicap-calculator',
        loadComponent: () => import('./pages/golf-handicap-calculator/golf-handicap-calculator.component').then((m) => m.GolfHandicapCalculatorComponent),
      },
      {
        path: 'gpa-calculator',
        loadComponent: () => import('./pages/gpa-calculator/gpa-calculator.component').then((m) => m.GpaCalculatorComponent),
      },
      {
        path: 'grade-calculator',
        loadComponent: () => import('./pages/grade-calculator/grade-calculator.component').then((m) => m.GradeCalculatorComponent),
      },
      {
        path: 'grayscale-converter',
        loadComponent: () => import('./pages/grayscale-converter/grayscale-converter.component').then((m) => m.GrayscaleConverterComponent),
      },
      {
        path: 'color-desaturator',
        loadComponent: () => import('./pages/color-desaturator/color-desaturator.component').then((m) => m.ColorDesaturatorComponent),
      },
      {
        path: 'gst-calculator',
        loadComponent: () => import('./pages/gst-calculator/gst-calculator.component').then((m) => m.GstCalculatorComponent),
      },
      {
        path: 'gstin-validator',
        loadComponent: () => import('./pages/gstin-validator/gstin-validator.component').then((m) => m.GstinValidatorComponent),
      },
      {
        path: 'guitar-capo-calculator',
        loadComponent: () => import('./pages/guitar-capo-calculator/guitar-capo-calculator.component').then((m) => m.GuitarCapoCalculatorComponent),
      },
      {
        path: 'guitar-chord-finder',
        loadComponent: () => import('./pages/guitar-chord-finder/guitar-chord-finder.component').then((m) => m.GuitarChordFinderComponent),
      },
      {
        path: 'guitar-chord-transposer',
        loadComponent: () => import('./pages/guitar-chord-transposer/guitar-chord-transposer.component').then((m) => m.GuitarChordTransposerComponent),
      },
      {
        path: 'gyroscope-test',
        loadComponent: () => import('./pages/gyroscope-test/gyroscope-test.component').then((m) => m.GyroscopeTestComponent),
      },
      {
        path: 'half-life-calculator',
        loadComponent: () => import('./pages/half-life-calculator/half-life-calculator.component').then((m) => m.HalfLifeCalculatorComponent),
      },
      {
        path: 'handwriting-to-font-converter',
        loadComponent: () => import('./pages/handwriting-to-font-converter/handwriting-to-font-converter.component').then((m) => m.HandwritingToFontConverterComponent),
      },
      {
        path: 'har-file-viewer',
        loadComponent: () => import('./pages/har-file-viewer/har-file-viewer.component').then((m) => m.HarFileViewerComponent),
      },
      {
        path: 'hash-generator',
        loadComponent: () => import('./pages/hash-generator/hash-generator.component').then((m) => m.HashGeneratorComponent),
      },
      {
        path: 'ideal-weight-calculator',
        loadComponent: () => import('./pages/ideal-weight-calculator/ideal-weight-calculator.component').then((m) => m.IdealWeightCalculatorComponent),
      },
      {
        path: 'heat-index-calculator',
        loadComponent: () => import('./pages/heat-index-calculator/heat-index-calculator.component').then((m) => m.HeatIndexCalculatorComponent),
      },
      {
        path: 'child-height-predictor',
        loadComponent: () => import('./pages/child-height-predictor/child-height-predictor.component').then((m) => m.ChildHeightPredictorComponent),
      },
      {
        path: 'height-converter',
        loadComponent: () => import('./pages/height-converter/height-converter.component').then((m) => m.HeightConverterComponent),
      },
      {
        path: 'heloc-calculator',
        loadComponent: () => import('./pages/heloc-calculator/heloc-calculator.component').then((m) => m.HelocCalculatorComponent),
      },
      {
        path: 'hex-calculator',
        loadComponent: () => import('./pages/hex-calculator/hex-calculator.component').then((m) => m.HexCalculatorComponent),
      },
      {
        path: 'base-converter',
        loadComponent: () => import('./pages/base-converter/base-converter.component').then((m) => m.BaseConverterComponent),
      },
      {
        path: 'hex-to-rgba-converter',
        loadComponent: () => import('./pages/hex-to-rgba-converter/hex-to-rgba-converter.component').then((m) => m.HexToRgbaConverterComponent),
      },
      {
        path: 'hmac-generator',
        loadComponent: () => import('./pages/hmac-generator/hmac-generator.component').then((m) => m.HmacGeneratorComponent),
      },
      {
        path: 'home-equity-loan-calculator',
        loadComponent: () => import('./pages/home-equity-loan-calculator/home-equity-loan-calculator.component').then((m) => m.HomeEquityLoanCalculatorComponent),
      },
      {
        path: 'horsepower-calculator',
        loadComponent: () => import('./pages/horsepower-calculator/horsepower-calculator.component').then((m) => m.HorsepowerCalculatorComponent),
      },
      {
        path: 'salary-to-hourly-calculator',
        loadComponent: () => import('./pages/salary-to-hourly-calculator/salary-to-hourly-calculator.component').then((m) => m.SalaryToHourlyCalculatorComponent),
      },
      {
        path: 'time-card-calculator',
        loadComponent: () => import('./pages/time-card-calculator/time-card-calculator.component').then((m) => m.TimeCardCalculatorComponent),
      },
      {
        path: 'home-affordability-calculator',
        loadComponent: () => import('./pages/home-affordability-calculator/home-affordability-calculator.component').then((m) => m.HomeAffordabilityCalculatorComponent),
      },
      {
        path: 'htaccess-redirect-generator',
        loadComponent: () => import('./pages/htaccess-redirect-generator/htaccess-redirect-generator.component').then((m) => m.HtaccessRedirectGeneratorComponent),
      },
      {
        path: 'online-html-editor',
        loadComponent: () => import('./pages/online-html-editor/online-html-editor.component').then((m) => m.OnlineHtmlEditorComponent),
      },
      {
        path: 'html-encoder-decoder',
        loadComponent: () => import('./pages/html-encoder-decoder/html-encoder-decoder.component').then((m) => m.HtmlEncoderDecoderComponent),
      },
      {
        path: 'html-entities-encoder-decoder',
        loadComponent: () => import('./pages/html-entities-encoder-decoder/html-entities-encoder-decoder.component').then((m) => m.HtmlEntitiesEncoderDecoderComponent),
      },
      {
        path: 'html-viewer',
        loadComponent: () => import('./pages/html-viewer/html-viewer.component').then((m) => m.HtmlViewerComponent),
      },
      {
        path: 'http-status-codes',
        loadComponent: () => import('./pages/http-status-codes/http-status-codes.component').then((m) => m.HttpStatusCodesComponent),
      },
      {
        path: 'image-to-ico-converter',
        loadComponent: () => import('./pages/image-to-ico-converter/image-to-ico-converter.component').then((m) => m.ImageToIcoConverterComponent),
      },
      {
        path: 'ico-editor',
        loadComponent: () => import('./pages/ico-editor/ico-editor.component').then((m) => m.IcoEditorComponent),
      },
      {
        path: 'image-color-extractor',
        loadComponent: () => import('./pages/image-color-extractor/image-color-extractor.component').then((m) => m.ImageColorExtractorComponent),
      },
      {
        path: 'image-color-picker',
        loadComponent: () => import('./pages/image-color-picker/image-color-picker.component').then((m) => m.ImageColorPickerComponent),
      },
      {
        path: 'image-compressor',
        loadComponent: () => import('./pages/image-compressor/image-compressor.component').then((m) => m.ImageCompressorComponent),
      },
      {
        path: 'image-converter',
        loadComponent: () => import('./pages/image-converter/image-converter.component').then((m) => m.ImageConverterComponent),
      },
      {
        path: 'photo-filters',
        loadComponent: () => import('./pages/photo-filters/photo-filters.component').then((m) => m.PhotoFiltersComponent),
      },
      {
        path: 'gradient-wallpaper-maker',
        loadComponent: () => import('./pages/gradient-wallpaper-maker/gradient-wallpaper-maker.component').then((m) => m.GradientWallpaperMakerComponent),
      },
      {
        path: 'image-histogram',
        loadComponent: () => import('./pages/image-histogram/image-histogram.component').then((m) => m.ImageHistogramComponent),
      },
      {
        path: 'image-to-base64-converter',
        loadComponent: () => import('./pages/image-to-base64-converter/image-to-base64-converter.component').then((m) => m.ImageToBase64ConverterComponent),
      },
      {
        path: 'image-to-text-converter',
        loadComponent: () => import('./pages/image-to-text-converter/image-to-text-converter.component').then((m) => m.ImageToTextConverterComponent),
      },
      {
        path: 'jpg-to-pdf',
        loadComponent: () => import('./pages/jpg-to-pdf/jpg-to-pdf.component').then((m) => m.JpgToPdfComponent),
      },
      {
        path: 'income-tax-calculator',
        loadComponent: () => import('./pages/income-tax-calculator/income-tax-calculator.component').then((m) => m.IncomeTaxCalculatorComponent),
      },
      {
        path: 'inflation-calculator',
        loadComponent: () => import('./pages/inflation-calculator/inflation-calculator.component').then((m) => m.InflationCalculatorComponent),
      },
      {
        path: 'influencer-cost-calculator',
        loadComponent: () => import('./pages/influencer-cost-calculator/influencer-cost-calculator.component').then((m) => m.InfluencerCostCalculatorComponent),
      },
      {
        path: 'instrument-tuner',
        loadComponent: () => import('./pages/instrument-tuner/instrument-tuner.component').then((m) => m.InstrumentTunerComponent),
      },
      {
        path: 'interest-rate-calculator',
        loadComponent: () => import('./pages/interest-rate-calculator/interest-rate-calculator.component').then((m) => m.InterestRateCalculatorComponent),
      },
      {
        path: 'color-inverter',
        loadComponent: () => import('./pages/color-inverter/color-inverter.component').then((m) => m.ColorInverterComponent),
      },
      {
        path: 'investment-calculator',
        loadComponent: () => import('./pages/investment-calculator/investment-calculator.component').then((m) => m.InvestmentCalculatorComponent),
      },
      {
        path: 'investment-fee-calculator',
        loadComponent: () => import('./pages/investment-fee-calculator/investment-fee-calculator.component').then((m) => m.InvestmentFeeCalculatorComponent),
      },
      {
        path: 'invisible-character',
        loadComponent: () => import('./pages/invisible-character/invisible-character.component').then((m) => m.InvisibleCharacterComponent),
      },
      {
        path: 'invitation-maker',
        loadComponent: () => import('./pages/invitation-maker/invitation-maker.component').then((m) => m.InvitationMakerComponent),
      },
      {
        path: 'invoice-generator',
        loadComponent: () => import('./pages/invoice-generator/invoice-generator.component').then((m) => m.InvoiceGeneratorComponent),
      },
      {
        path: 'subnet-calculator',
        loadComponent: () => import('./pages/subnet-calculator/subnet-calculator.component').then((m) => m.SubnetCalculatorComponent),
      },
      {
        path: 'cidr-calculator',
        loadComponent: () => import('./pages/cidr-calculator/cidr-calculator.component').then((m) => m.CidrCalculatorComponent),
      },
      {
        path: 'ira-calculator',
        loadComponent: () => import('./pages/ira-calculator/ira-calculator.component').then((m) => m.IraCalculatorComponent),
      },
      {
        path: 'irr-calculator',
        loadComponent: () => import('./pages/irr-calculator/irr-calculator.component').then((m) => m.IrrCalculatorComponent),
      },
      {
        path: 'javascript-obfuscator',
        loadComponent: () => import('./pages/javascript-obfuscator/javascript-obfuscator.component').then((m) => m.JavascriptObfuscatorComponent),
      },
      {
        path: 'join-files',
        loadComponent: () => import('./pages/join-files/join-files.component').then((m) => m.JoinFilesComponent),
      },
      {
        path: 'json-c',
        loadComponent: () => import('./pages/json-c/json-c.component').then((m) => m.JsonCComponent),
      },
      {
        path: 'json-to-csv',
        loadComponent: () => import('./pages/json-to-csv/json-to-csv.component').then((m) => m.JsonToCsvComponent),
      },
      {
        path: 'json-diff',
        loadComponent: () => import('./pages/json-diff/json-diff.component').then((m) => m.JsonDiffComponent),
      },
      {
        path: 'json-formatter',
        loadComponent: () => import('./pages/json-formatter/json-formatter.component').then((m) => m.JsonFormatterComponent),
      },
      {
        path: 'json-schema-validator',
        loadComponent: () => import('./pages/json-schema-validator/json-schema-validator.component').then((m) => m.JsonSchemaValidatorComponent),
      },
      {
        path: 'json-to-xml',
        loadComponent: () => import('./pages/json-to-xml/json-to-xml.component').then((m) => m.JsonToXmlComponent),
      },
      {
        path: 'json-viewer',
        loadComponent: () => import('./pages/json-viewer/json-viewer.component').then((m) => m.JsonViewerComponent),
      },
      {
        path: 'json-typescript',
        loadComponent: () => import('./pages/json-typescript/json-typescript.component').then((m) => m.JsonTypescriptComponent),
      },
      {
        path: 'json-validator',
        loadComponent: () => import('./pages/json-validator/json-validator.component').then((m) => m.JsonValidatorComponent),
      },
      {
        path: 'json-xml-csv-converter',
        loadComponent: () => import('./pages/json-xml-csv-converter/json-xml-csv-converter.component').then((m) => m.JsonXmlCsvConverterComponent),
      },
      {
        path: 'json-to-yaml',
        loadComponent: () => import('./pages/json-to-yaml/json-to-yaml.component').then((m) => m.JsonToYamlComponent),
      },
      {
        path: 'jsonpath-tester',
        loadComponent: () => import('./pages/jsonpath-tester/jsonpath-tester.component').then((m) => m.JsonpathTesterComponent),
      },
      {
        path: 'jwt-decoder',
        loadComponent: () => import('./pages/jwt-decoder/jwt-decoder.component').then((m) => m.JwtDecoderComponent),
      },
      {
        path: 'key-rollover-test',
        loadComponent: () => import('./pages/key-rollover-test/key-rollover-test.component').then((m) => m.KeyRolloverTestComponent),
      },
      {
        path: 'keyboard-tester',
        loadComponent: () => import('./pages/keyboard-tester/keyboard-tester.component').then((m) => m.KeyboardTesterComponent),
      },
      {
        path: 'keyword-density-checker',
        loadComponent: () => import('./pages/keyword-density-checker/keyword-density-checker.component').then((m) => m.KeywordDensityCheckerComponent),
      },
      {
        path: 'kilojoules-calories-converter',
        loadComponent: () => import('./pages/kilojoules-calories-converter/kilojoules-calories-converter.component').then((m) => m.KilojoulesCaloriesConverterComponent),
      },
      {
        path: 'kindle-highlights-exporter',
        loadComponent: () => import('./pages/kindle-highlights-exporter/kindle-highlights-exporter.component').then((m) => m.KindleHighlightsExporterComponent),
      },
      {
        path: 'lcm-calculator',
        loadComponent: () => import('./pages/lcm-calculator/lcm-calculator.component').then((m) => m.LcmCalculatorComponent),
      },
      {
        path: 'lead-scoring-calculator',
        loadComponent: () => import('./pages/lead-scoring-calculator/lead-scoring-calculator.component').then((m) => m.LeadScoringCalculatorComponent),
      },
      {
        path: 'lean-body-mass-calculator',
        loadComponent: () => import('./pages/lean-body-mass-calculator/lean-body-mass-calculator.component').then((m) => m.LeanBodyMassCalculatorComponent),
      },
      {
        path: 'lease-calculator',
        loadComponent: () => import('./pages/lease-calculator/lease-calculator.component').then((m) => m.LeaseCalculatorComponent),
      },
      {
        path: 'led-savings-calculator',
        loadComponent: () => import('./pages/led-savings-calculator/led-savings-calculator.component').then((m) => m.LedSavingsCalculatorComponent),
      },
      {
        path: 'length-converter',
        loadComponent: () => import('./pages/length-converter/length-converter.component').then((m) => m.LengthConverterComponent),
      },
      {
        path: 'line-joiner',
        loadComponent: () => import('./pages/line-joiner/line-joiner.component').then((m) => m.LineJoinerComponent),
      },
      {
        path: 'list-randomizer',
        loadComponent: () => import('./pages/list-randomizer/list-randomizer.component').then((m) => m.ListRandomizerComponent),
      },
      {
        path: 'llms-txt-generator',
        loadComponent: () => import('./pages/llms-txt-generator/llms-txt-generator.component').then((m) => m.LlmsTxtGeneratorComponent),
      },
      {
        path: 'loan-payoff-calculator',
        loadComponent: () => import('./pages/loan-payoff-calculator/loan-payoff-calculator.component').then((m) => m.LoanPayoffCalculatorComponent),
      },
      {
        path: 'log-calculator',
        loadComponent: () => import('./pages/log-calculator/log-calculator.component').then((m) => m.LogCalculatorComponent),
      },
      {
        path: 'logo-maker',
        loadComponent: () => import('./pages/logo-maker/logo-maker.component').then((m) => m.LogoMakerComponent),
      },
      {
        path: 'long-division-calculator',
        loadComponent: () => import('./pages/long-division-calculator/long-division-calculator.component').then((m) => m.LongDivisionCalculatorComponent),
      },
      {
        path: 'lorem-ipsum-generator',
        loadComponent: () => import('./pages/lorem-ipsum-generator/lorem-ipsum-generator.component').then((m) => m.LoremIpsumGeneratorComponent),
      },
      {
        path: 'love-calculator',
        loadComponent: () => import('./pages/love-calculator/love-calculator.component').then((m) => m.LoveCalculatorComponent),
      },
      {
        path: 'macro-calculator',
        loadComponent: () => import('./pages/macro-calculator/macro-calculator.component').then((m) => m.MacroCalculatorComponent),
      },
      {
        path: 'margin-calculator',
        loadComponent: () => import('./pages/margin-calculator/margin-calculator.component').then((m) => m.MarginCalculatorComponent),
      },
      {
        path: 'margin-markup-calculator',
        loadComponent: () => import('./pages/margin-markup-calculator/margin-markup-calculator.component').then((m) => m.MarginMarkupCalculatorComponent),
      },
      {
        path: 'markdown-html',
        loadComponent: () => import('./pages/markdown-html/markdown-html.component').then((m) => m.MarkdownHtmlComponent),
      },
      {
        path: 'markdown-preview',
        loadComponent: () => import('./pages/markdown-preview/markdown-preview.component').then((m) => m.MarkdownPreviewComponent),
      },
      {
        path: 'markdown-table-generator',
        loadComponent: () => import('./pages/markdown-table-generator/markdown-table-generator.component').then((m) => m.MarkdownTableGeneratorComponent),
      },
      {
        path: 'marketing-budget-calculator',
        loadComponent: () => import('./pages/marketing-budget-calculator/marketing-budget-calculator.component').then((m) => m.MarketingBudgetCalculatorComponent),
      },
      {
        path: 'report-card-generator',
        loadComponent: () => import('./pages/report-card-generator/report-card-generator.component').then((m) => m.ReportCardGeneratorComponent),
      },
      {
        path: 'marriage-tax-calculator',
        loadComponent: () => import('./pages/marriage-tax-calculator/marriage-tax-calculator.component').then((m) => m.MarriageTaxCalculatorComponent),
      },
      {
        path: 'mass-calculator',
        loadComponent: () => import('./pages/mass-calculator/mass-calculator.component').then((m) => m.MassCalculatorComponent),
      },
      {
        path: 'material-estimator',
        loadComponent: () => import('./pages/material-estimator/material-estimator.component').then((m) => m.MaterialEstimatorComponent),
      },
      {
        path: 'matrix-calculator',
        loadComponent: () => import('./pages/matrix-calculator/matrix-calculator.component').then((m) => m.MatrixCalculatorComponent),
      },
      {
        path: 'mean-median-mode-range-calculator',
        loadComponent: () => import('./pages/mean-median-mode-range-calculator/mean-median-mode-range-calculator.component').then((m) => m.MeanMedianModeRangeCalculatorComponent),
      },
      {
        path: 'meme-generator',
        loadComponent: () => import('./pages/meme-generator/meme-generator.component').then((m) => m.MemeGeneratorComponent),
      },
      {
        path: 'merge-images',
        loadComponent: () => import('./pages/merge-images/merge-images.component').then((m) => m.MergeImagesComponent),
      },
      {
        path: 'merge-pdf',
        loadComponent: () => import('./pages/merge-pdf/merge-pdf.component').then((m) => m.MergePdfComponent),
      },
      {
        path: 'n-up-pdf',
        loadComponent: () => import('./pages/n-up-pdf/n-up-pdf.component').then((m) => m.NUpPdfComponent),
      },
      {
        path: 'meta-tags-generator',
        loadComponent: () => import('./pages/meta-tags-generator/meta-tags-generator.component').then((m) => m.MetaTagsGeneratorComponent),
      },
      {
        path: 'serp-preview-tool',
        loadComponent: () => import('./pages/serp-preview-tool/serp-preview-tool.component').then((m) => m.SerpPreviewToolComponent),
      },
      {
        path: 'metronome',
        loadComponent: () => import('./pages/metronome/metronome.component').then((m) => m.MetronomeComponent),
      },
      {
        path: 'mic-test',
        loadComponent: () => import('./pages/mic-test/mic-test.component').then((m) => m.MicTestComponent),
      },
      {
        path: 'miles-per-kwh-calculator',
        loadComponent: () => import('./pages/miles-per-kwh-calculator/miles-per-kwh-calculator.component').then((m) => m.MilesPerKwhCalculatorComponent),
      },
      {
        path: 'million-billion-converter',
        loadComponent: () => import('./pages/million-billion-converter/million-billion-converter.component').then((m) => m.MillionBillionConverterComponent),
      },
      {
        path: 'mime-types',
        loadComponent: () => import('./pages/mime-types/mime-types.component').then((m) => m.MimeTypesComponent),
      },
      {
        path: 'min-max-of-a-list',
        loadComponent: () => import('./pages/min-max-of-a-list/min-max-of-a-list.component').then((m) => m.MinMaxOfAListComponent),
      },
      {
        path: 'fake-json-generator',
        loadComponent: () => import('./pages/fake-json-generator/fake-json-generator.component').then((m) => m.FakeJsonGeneratorComponent),
      },
      {
        path: 'molarity-calculator',
        loadComponent: () => import('./pages/molarity-calculator/molarity-calculator.component').then((m) => m.MolarityCalculatorComponent),
      },
      {
        path: 'molecular-weight-calculator',
        loadComponent: () => import('./pages/molecular-weight-calculator/molecular-weight-calculator.component').then((m) => m.MolecularWeightCalculatorComponent),
      },
      {
        path: 'money-counter',
        loadComponent: () => import('./pages/money-counter/money-counter.component').then((m) => m.MoneyCounterComponent),
      },
      {
        path: 'how-long-will-my-money-last-calculator',
        loadComponent: () => import('./pages/how-long-will-my-money-last-calculator/how-long-will-my-money-last-calculator.component').then((m) => m.HowLongWillMyMoneyLastCalculatorComponent),
      },
      {
        path: 'money-market-account-calculator',
        loadComponent: () => import('./pages/money-market-account-calculator/money-market-account-calculator.component').then((m) => m.MoneyMarketAccountCalculatorComponent),
      },
      {
        path: 'monitor-test',
        loadComponent: () => import('./pages/monitor-test/monitor-test.component').then((m) => m.MonitorTestComponent),
      },
      {
        path: 'monochromatic-color-generator',
        loadComponent: () => import('./pages/monochromatic-color-generator/monochromatic-color-generator.component').then((m) => m.MonochromaticColorGeneratorComponent),
      },
      {
        path: 'mortgage-amortization-calculator',
        loadComponent: () => import('./pages/mortgage-amortization-calculator/mortgage-amortization-calculator.component').then((m) => m.MortgageAmortizationCalculatorComponent),
      },
      {
        path: 'mortgage-calculator',
        loadComponent: () => import('./pages/mortgage-calculator/mortgage-calculator.component').then((m) => m.MortgageCalculatorComponent),
      },
      {
        path: 'mortgage-payoff-calculator',
        loadComponent: () => import('./pages/mortgage-payoff-calculator/mortgage-payoff-calculator.component').then((m) => m.MortgagePayoffCalculatorComponent),
      },
      {
        path: 'motor-starting-current-calculator',
        loadComponent: () => import('./pages/motor-starting-current-calculator/motor-starting-current-calculator.component').then((m) => m.MotorStartingCurrentCalculatorComponent),
      },
      {
        path: 'mouse-tester',
        loadComponent: () => import('./pages/mouse-tester/mouse-tester.component').then((m) => m.MouseTesterComponent),
      },
      {
        path: 'mpge-calculator',
        loadComponent: () => import('./pages/mpge-calculator/mpge-calculator.component').then((m) => m.MpgeCalculatorComponent),
      },
      {
        path: 'mutual-fund-calculator',
        loadComponent: () => import('./pages/mutual-fund-calculator/mutual-fund-calculator.component').then((m) => m.MutualFundCalculatorComponent),
      },
      {
        path: 'nato-phonetic-alphabet-converter',
        loadComponent: () => import('./pages/nato-phonetic-alphabet-converter/nato-phonetic-alphabet-converter.component').then((m) => m.NatoPhoneticAlphabetConverterComponent),
      },
      {
        path: 'white-noise-generator',
        loadComponent: () => import('./pages/white-noise-generator/white-noise-generator.component').then((m) => m.WhiteNoiseGeneratorComponent),
      },
      {
        path: 'note-frequency-calculator',
        loadComponent: () => import('./pages/note-frequency-calculator/note-frequency-calculator.component').then((m) => m.NoteFrequencyCalculatorComponent),
      },
      {
        path: 'online-notepad',
        loadComponent: () => import('./pages/online-notepad/online-notepad.component').then((m) => m.OnlineNotepadComponent),
      },
      {
        path: 'npv-calculator',
        loadComponent: () => import('./pages/npv-calculator/npv-calculator.component').then((m) => m.NpvCalculatorComponent),
      },
      {
        path: 'number-base-converter',
        loadComponent: () => import('./pages/number-base-converter/number-base-converter.component').then((m) => m.NumberBaseConverterComponent),
      },
      {
        path: 'number-converter',
        loadComponent: () => import('./pages/number-converter/number-converter.component').then((m) => m.NumberConverterComponent),
      },
      {
        path: 'number-sequence-calculator',
        loadComponent: () => import('./pages/number-sequence-calculator/number-sequence-calculator.component').then((m) => m.NumberSequenceCalculatorComponent),
      },
      {
        path: 'number-to-words-converter',
        loadComponent: () => import('./pages/number-to-words-converter/number-to-words-converter.component').then((m) => m.NumberToWordsConverterComponent),
      },
      {
        path: 'ohms-law-calculator',
        loadComponent: () => import('./pages/ohms-law-calculator/ohms-law-calculator.component').then((m) => m.OhmsLawCalculatorComponent),
      },
      {
        path: 'one-rep-max-calculator',
        loadComponent: () => import('./pages/one-rep-max-calculator/one-rep-max-calculator.component').then((m) => m.OneRepMaxCalculatorComponent),
      },
      {
        path: 'online-text-editor',
        loadComponent: () => import('./pages/online-text-editor/online-text-editor.component').then((m) => m.OnlineTextEditorComponent),
      },
      {
        path: 'organize-pdf-pages',
        loadComponent: () => import('./pages/organize-pdf-pages/organize-pdf-pages.component').then((m) => m.OrganizePdfPagesComponent),
      },
      {
        path: 'overlay-pdf',
        loadComponent: () => import('./pages/overlay-pdf/overlay-pdf.component').then((m) => m.OverlayPdfComponent),
      },
      {
        path: 'photo-overlay',
        loadComponent: () => import('./pages/photo-overlay/photo-overlay.component').then((m) => m.PhotoOverlayComponent),
      },
      {
        path: 'overtime-calculator',
        loadComponent: () => import('./pages/overtime-calculator/overtime-calculator.component').then((m) => m.OvertimeCalculatorComponent),
      },
      {
        path: 'overweight-calculator',
        loadComponent: () => import('./pages/overweight-calculator/overweight-calculator.component').then((m) => m.OverweightCalculatorComponent),
      },
      {
        path: 'ovulation-calculator',
        loadComponent: () => import('./pages/ovulation-calculator/ovulation-calculator.component').then((m) => m.OvulationCalculatorComponent),
      },
      {
        path: 'p-value-calculator',
        loadComponent: () => import('./pages/p-value-calculator/p-value-calculator.component').then((m) => m.PValueCalculatorComponent),
      },
      {
        path: 'pace-calculator',
        loadComponent: () => import('./pages/pace-calculator/pace-calculator.component').then((m) => m.PaceCalculatorComponent),
      },
      {
        path: 'paint-calculator',
        loadComponent: () => import('./pages/paint-calculator/paint-calculator.component').then((m) => m.PaintCalculatorComponent),
      },
      {
        path: 'palette-generator',
        loadComponent: () => import('./pages/palette-generator/palette-generator.component').then((m) => m.PaletteGeneratorComponent),
      },
      {
        path: 'pan-validator',
        loadComponent: () => import('./pages/pan-validator/pan-validator.component').then((m) => m.PanValidatorComponent),
      },
      {
        path: 'password-strength-checker',
        loadComponent: () => import('./pages/password-strength-checker/password-strength-checker.component').then((m) => m.PasswordStrengthCheckerComponent),
      },
      {
        path: 'pay-raise-calculator',
        loadComponent: () => import('./pages/pay-raise-calculator/pay-raise-calculator.component').then((m) => m.PayRaiseCalculatorComponent),
      },
      {
        path: 'payback-period-calculator',
        loadComponent: () => import('./pages/payback-period-calculator/payback-period-calculator.component').then((m) => m.PaybackPeriodCalculatorComponent),
      },
      {
        path: 'time-value-of-money-calculator',
        loadComponent: () => import('./pages/time-value-of-money-calculator/time-value-of-money-calculator.component').then((m) => m.TimeValueOfMoneyCalculatorComponent),
      },
      {
        path: 'fill-pdf-form',
        loadComponent: () => import('./pages/fill-pdf-form/fill-pdf-form.component').then((m) => m.FillPdfFormComponent),
      },
      {
        path: 'pdf-background-color',
        loadComponent: () => import('./pages/pdf-background-color/pdf-background-color.component').then((m) => m.PdfBackgroundColorComponent),
      },
      {
        path: 'pdf-metadata-editor',
        loadComponent: () => import('./pages/pdf-metadata-editor/pdf-metadata-editor.component').then((m) => m.PdfMetadataEditorComponent),
      },
      {
        path: 'pdf-to-html',
        loadComponent: () => import('./pages/pdf-to-html/pdf-to-html.component').then((m) => m.PdfToHtmlComponent),
      },
      {
        path: 'pdf-to-jpg',
        loadComponent: () => import('./pages/pdf-to-jpg/pdf-to-jpg.component').then((m) => m.PdfToJpgComponent),
      },
      {
        path: 'pdf-to-png',
        loadComponent: () => import('./pages/pdf-to-png/pdf-to-png.component').then((m) => m.PdfToPngComponent),
      },
      {
        path: 'pdf-to-markdown',
        loadComponent: () => import('./pages/pdf-to-markdown/pdf-to-markdown.component').then((m) => m.PdfToMarkdownComponent),
      },
      {
        path: 'pdf-to-text',
        loadComponent: () => import('./pages/pdf-to-text/pdf-to-text.component').then((m) => m.PdfToTextComponent),
      },
      {
        path: 'pdf-to-zip',
        loadComponent: () => import('./pages/pdf-to-zip/pdf-to-zip.component').then((m) => m.PdfToZipComponent),
      },
      {
        path: 'png-to-pdf',
        loadComponent: () => import('./pages/png-to-pdf/png-to-pdf.component').then((m) => m.PngToPdfComponent),
      },
      {
        path: 'pension-calculator',
        loadComponent: () => import('./pages/pension-calculator/pension-calculator.component').then((m) => m.PensionCalculatorComponent),
      },
      {
        path: 'percent-error-calculator',
        loadComponent: () => import('./pages/percent-error-calculator/percent-error-calculator.component').then((m) => m.PercentErrorCalculatorComponent),
      },
      {
        path: 'percent-off-calculator',
        loadComponent: () => import('./pages/percent-off-calculator/percent-off-calculator.component').then((m) => m.PercentOffCalculatorComponent),
      },
      {
        path: 'percentage-change-calculator',
        loadComponent: () => import('./pages/percentage-change-calculator/percentage-change-calculator.component').then((m) => m.PercentageChangeCalculatorComponent),
      },
      {
        path: 'period-pregnancy-tracker',
        loadComponent: () => import('./pages/period-pregnancy-tracker/period-pregnancy-tracker.component').then((m) => m.PeriodPregnancyTrackerComponent),
      },
      {
        path: 'permissions-policy-generator',
        loadComponent: () => import('./pages/permissions-policy-generator/permissions-policy-generator.component').then((m) => m.PermissionsPolicyGeneratorComponent),
      },
      {
        path: 'permutation-and-combination-calculator',
        loadComponent: () => import('./pages/permutation-and-combination-calculator/permutation-and-combination-calculator.component').then((m) => m.PermutationAndCombinationCalculatorComponent),
      },
      {
        path: 'personal-loan-calculator',
        loadComponent: () => import('./pages/personal-loan-calculator/personal-loan-calculator.component').then((m) => m.PersonalLoanCalculatorComponent),
      },
      {
        path: 'piano-note-checker',
        loadComponent: () => import('./pages/piano-note-checker/piano-note-checker.component').then((m) => m.PianoNoteCheckerComponent),
      },
      {
        path: 'pixelate-image',
        loadComponent: () => import('./pages/pixelate-image/pixelate-image.component').then((m) => m.PixelateImageComponent),
      },
      {
        path: 'pomodoro-timer',
        loadComponent: () => import('./pages/pomodoro-timer/pomodoro-timer.component').then((m) => m.PomodoroTimerComponent),
      },
      {
        path: 'poster-maker',
        loadComponent: () => import('./pages/poster-maker/poster-maker.component').then((m) => m.PosterMakerComponent),
      },
      {
        path: 'posterize-effect',
        loadComponent: () => import('./pages/posterize-effect/posterize-effect.component').then((m) => m.PosterizeEffectComponent),
      },
      {
        path: 'power-converter',
        loadComponent: () => import('./pages/power-converter/power-converter.component').then((m) => m.PowerConverterComponent),
      },
      {
        path: 'pregnancy-weight-gain-calculator',
        loadComponent: () => import('./pages/pregnancy-weight-gain-calculator/pregnancy-weight-gain-calculator.component').then((m) => m.PregnancyWeightGainCalculatorComponent),
      },
      {
        path: 'present-value-calculator',
        loadComponent: () => import('./pages/present-value-calculator/present-value-calculator.component').then((m) => m.PresentValueCalculatorComponent),
      },
      {
        path: 'price-per-square-foot-calculator',
        loadComponent: () => import('./pages/price-per-square-foot-calculator/price-per-square-foot-calculator.component').then((m) => m.PricePerSquareFootCalculatorComponent),
      },
      {
        path: 'prime-factorization-calculator',
        loadComponent: () => import('./pages/prime-factorization-calculator/prime-factorization-calculator.component').then((m) => m.PrimeFactorizationCalculatorComponent),
      },
      {
        path: 'probability-calculator',
        loadComponent: () => import('./pages/probability-calculator/probability-calculator.component').then((m) => m.ProbabilityCalculatorComponent),
      },
      {
        path: 'profile-picture-maker',
        loadComponent: () => import('./pages/profile-picture-maker/profile-picture-maker.component').then((m) => m.ProfilePictureMakerComponent),
      },
      {
        path: 'token-counter',
        loadComponent: () => import('./pages/token-counter/token-counter.component').then((m) => m.TokenCounterComponent),
      },
      {
        path: 'protect-pdf',
        loadComponent: () => import('./pages/protect-pdf/protect-pdf.component').then((m) => m.ProtectPdfComponent),
      },
      {
        path: 'protein-calculator',
        loadComponent: () => import('./pages/protein-calculator/protein-calculator.component').then((m) => m.ProteinCalculatorComponent),
      },
      {
        path: 'psd-to-jpg-converter',
        loadComponent: () => import('./pages/psd-to-jpg-converter/psd-to-jpg-converter.component').then((m) => m.PsdToJpgConverterComponent),
      },
      {
        path: 'pwa-manifest-checker',
        loadComponent: () => import('./pages/pwa-manifest-checker/pwa-manifest-checker.component').then((m) => m.PwaManifestCheckerComponent),
      },
      {
        path: 'pythagorean-theorem-calculator',
        loadComponent: () => import('./pages/pythagorean-theorem-calculator/pythagorean-theorem-calculator.component').then((m) => m.PythagoreanTheoremCalculatorComponent),
      },
      {
        path: 'qibla-direction-finder',
        loadComponent: () => import('./pages/qibla-direction-finder/qibla-direction-finder.component').then((m) => m.QiblaDirectionFinderComponent),
      },
      {
        path: 'qr-code-scanner',
        loadComponent: () => import('./pages/qr-code-scanner/qr-code-scanner.component').then((m) => m.QrCodeScannerComponent),
      },
      {
        path: 'quadratic-formula-calculator',
        loadComponent: () => import('./pages/quadratic-formula-calculator/quadratic-formula-calculator.component').then((m) => m.QuadraticFormulaCalculatorComponent),
      },
      {
        path: 'quick-ratio-calculator',
        loadComponent: () => import('./pages/quick-ratio-calculator/quick-ratio-calculator.component').then((m) => m.QuickRatioCalculatorComponent),
      },
      {
        path: 'quotation-generator',
        loadComponent: () => import('./pages/quotation-generator/quotation-generator.component').then((m) => m.QuotationGeneratorComponent),
      },
      {
        path: 'typing-test',
        loadComponent: () => import('./pages/typing-test/typing-test.component').then((m) => m.TypingTestComponent),
      },
      {
        path: 'pixel-art-generator',
        loadComponent: () => import('./pages/pixel-art-generator/pixel-art-generator.component').then((m) => m.PixelArtGeneratorComponent),
      },
      {
        path: 'random-color-generator',
        loadComponent: () => import('./pages/random-color-generator/random-color-generator.component').then((m) => m.RandomColorGeneratorComponent),
      },
      {
        path: 'random-number-generator',
        loadComponent: () => import('./pages/random-number-generator/random-number-generator.component').then((m) => m.RandomNumberGeneratorComponent),
      },
      {
        path: 'image-to-svg-converter',
        loadComponent: () => import('./pages/image-to-svg-converter/image-to-svg-converter.component').then((m) => m.ImageToSvgConverterComponent),
      },
      {
        path: 'ratio-calculator',
        loadComponent: () => import('./pages/ratio-calculator/ratio-calculator.component').then((m) => m.RatioCalculatorComponent),
      },
      {
        path: 'react-native-shadow-generator',
        loadComponent: () => import('./pages/react-native-shadow-generator/react-native-shadow-generator.component').then((m) => m.ReactNativeShadowGeneratorComponent),
      },
      {
        path: 'real-estate-calculator',
        loadComponent: () => import('./pages/real-estate-calculator/real-estate-calculator.component').then((m) => m.RealEstateCalculatorComponent),
      },
      {
        path: 'real-estate-investment-calculator',
        loadComponent: () => import('./pages/real-estate-investment-calculator/real-estate-investment-calculator.component').then((m) => m.RealEstateInvestmentCalculatorComponent),
      },
      {
        path: 'redact-pdf',
        loadComponent: () => import('./pages/redact-pdf/redact-pdf.component').then((m) => m.RedactPdfComponent),
      },
      {
        path: 'resize-pdf-pages',
        loadComponent: () => import('./pages/resize-pdf-pages/resize-pdf-pages.component').then((m) => m.ResizePdfPagesComponent),
      },
      {
        path: 'refinance-calculator',
        loadComponent: () => import('./pages/refinance-calculator/refinance-calculator.component').then((m) => m.RefinanceCalculatorComponent),
      },
      {
        path: 'regex-tester',
        loadComponent: () => import('./pages/regex-tester/regex-tester.component').then((m) => m.RegexTesterComponent),
      },
      {
        path: 'solid-background-remover',
        loadComponent: () => import('./pages/solid-background-remover/solid-background-remover.component').then((m) => m.SolidBackgroundRemoverComponent),
      },
      {
        path: 'remove-duplicate-lines',
        loadComponent: () => import('./pages/remove-duplicate-lines/remove-duplicate-lines.component').then((m) => m.RemoveDuplicateLinesComponent),
      },
      {
        path: 'image-denoiser',
        loadComponent: () => import('./pages/image-denoiser/image-denoiser.component').then((m) => m.ImageDenoiserComponent),
      },
      {
        path: 'rent-calculator',
        loadComponent: () => import('./pages/rent-calculator/rent-calculator.component').then((m) => m.RentCalculatorComponent),
      },
      {
        path: 'rent-vs-buy-calculator',
        loadComponent: () => import('./pages/rent-vs-buy-calculator/rent-vs-buy-calculator.component').then((m) => m.RentVsBuyCalculatorComponent),
      },
      {
        path: 'rental-property-calculator',
        loadComponent: () => import('./pages/rental-property-calculator/rental-property-calculator.component').then((m) => m.RentalPropertyCalculatorComponent),
      },
      {
        path: 'reorder-point-calculator',
        loadComponent: () => import('./pages/reorder-point-calculator/reorder-point-calculator.component').then((m) => m.ReorderPointCalculatorComponent),
      },
      {
        path: 'resistor-color-code-calculator',
        loadComponent: () => import('./pages/resistor-color-code-calculator/resistor-color-code-calculator.component').then((m) => m.ResistorColorCodeCalculatorComponent),
      },
      {
        path: 'image-resizer',
        loadComponent: () => import('./pages/image-resizer/image-resizer.component').then((m) => m.ImageResizerComponent),
      },
      {
        path: 'resume-builder',
        loadComponent: () => import('./pages/resume-builder/resume-builder.component').then((m) => m.ResumeBuilderComponent),
      },
      {
        path: 'retirement-calculator',
        loadComponent: () => import('./pages/retirement-calculator/retirement-calculator.component').then((m) => m.RetirementCalculatorComponent),
      },
      {
        path: 'reverse-list',
        loadComponent: () => import('./pages/reverse-list/reverse-list.component').then((m) => m.ReverseListComponent),
      },
      {
        path: 'reverse-text',
        loadComponent: () => import('./pages/reverse-text/reverse-text.component').then((m) => m.ReverseTextComponent),
      },
      {
        path: 'rgb-channel-splitter',
        loadComponent: () => import('./pages/rgb-channel-splitter/rgb-channel-splitter.component').then((m) => m.RgbChannelSplitterComponent),
      },
      {
        path: 'rgb-color-codes',
        loadComponent: () => import('./pages/rgb-color-codes/rgb-color-codes.component').then((m) => m.RgbColorCodesComponent),
      },
      {
        path: 'rgba-to-hex-converter',
        loadComponent: () => import('./pages/rgba-to-hex-converter/rgba-to-hex-converter.component').then((m) => m.RgbaToHexConverterComponent),
      },
      {
        path: 'rich-text-html-editor',
        loadComponent: () => import('./pages/rich-text-html-editor/rich-text-html-editor.component').then((m) => m.RichTextHtmlEditorComponent),
      },
      {
        path: 'right-triangle-calculator',
        loadComponent: () => import('./pages/right-triangle-calculator/right-triangle-calculator.component').then((m) => m.RightTriangleCalculatorComponent),
      },
      {
        path: 'rmd-calculator',
        loadComponent: () => import('./pages/rmd-calculator/rmd-calculator.component').then((m) => m.RmdCalculatorComponent),
      },
      {
        path: 'roas-calculator',
        loadComponent: () => import('./pages/roas-calculator/roas-calculator.component').then((m) => m.RoasCalculatorComponent),
      },
      {
        path: 'robots-txt-generator',
        loadComponent: () => import('./pages/robots-txt-generator/robots-txt-generator.component').then((m) => m.RobotsTxtGeneratorComponent),
      },
      {
        path: 'roi-calculator',
        loadComponent: () => import('./pages/roi-calculator/roi-calculator.component').then((m) => m.RoiCalculatorComponent),
      },
      {
        path: 'roman-numeral-converter',
        loadComponent: () => import('./pages/roman-numeral-converter/roman-numeral-converter.component').then((m) => m.RomanNumeralConverterComponent),
      },
      {
        path: 'roofing-calculator',
        loadComponent: () => import('./pages/roofing-calculator/roofing-calculator.component').then((m) => m.RoofingCalculatorComponent),
      },
      {
        path: 'root-calculator',
        loadComponent: () => import('./pages/root-calculator/root-calculator.component').then((m) => m.RootCalculatorComponent),
      },
      {
        path: 'rotate-pdf',
        loadComponent: () => import('./pages/rotate-pdf/rotate-pdf.component').then((m) => m.RotatePdfComponent),
      },
      {
        path: 'roth-ira-calculator',
        loadComponent: () => import('./pages/roth-ira-calculator/roth-ira-calculator.component').then((m) => m.RothIraCalculatorComponent),
      },
      {
        path: 'round-corners',
        loadComponent: () => import('./pages/round-corners/round-corners.component').then((m) => m.RoundCornersComponent),
      },
      {
        path: 'rounding-calculator',
        loadComponent: () => import('./pages/rounding-calculator/rounding-calculator.component').then((m) => m.RoundingCalculatorComponent),
      },
      {
        path: 'inverse-rule-of-three-calculator',
        loadComponent: () => import('./pages/inverse-rule-of-three-calculator/inverse-rule-of-three-calculator.component').then((m) => m.InverseRuleOfThreeCalculatorComponent),
      },
      {
        path: 'salary-calculator',
        loadComponent: () => import('./pages/salary-calculator/salary-calculator.component').then((m) => m.SalaryCalculatorComponent),
      },
      {
        path: 'sales-tax-calculator',
        loadComponent: () => import('./pages/sales-tax-calculator/sales-tax-calculator.component').then((m) => m.SalesTaxCalculatorComponent),
      },
      {
        path: 'sample-size-calculator',
        loadComponent: () => import('./pages/sample-size-calculator/sample-size-calculator.component').then((m) => m.SampleSizeCalculatorComponent),
      },
      {
        path: 'savings-calculator',
        loadComponent: () => import('./pages/savings-calculator/savings-calculator.component').then((m) => m.SavingsCalculatorComponent),
      },
      {
        path: 'savings-goal-calculator',
        loadComponent: () => import('./pages/savings-goal-calculator/savings-goal-calculator.component').then((m) => m.SavingsGoalCalculatorComponent),
      },
      {
        path: 'scale-trainer',
        loadComponent: () => import('./pages/scale-trainer/scale-trainer.component').then((m) => m.ScaleTrainerComponent),
      },
      {
        path: 'scan-to-pdf',
        loadComponent: () => import('./pages/scan-to-pdf/scan-to-pdf.component').then((m) => m.ScanToPdfComponent),
      },
      {
        path: 'schema-markup-generator',
        loadComponent: () => import('./pages/schema-markup-generator/schema-markup-generator.component').then((m) => m.SchemaMarkupGeneratorComponent),
      },
      {
        path: 'schema-markup-validator',
        loadComponent: () => import('./pages/schema-markup-validator/schema-markup-validator.component').then((m) => m.SchemaMarkupValidatorComponent),
      },
      {
        path: 'scientific-calculator',
        loadComponent: () => import('./pages/scientific-calculator/scientific-calculator.component').then((m) => m.ScientificCalculatorComponent),
      },
      {
        path: 'scientific-notation-calculator',
        loadComponent: () => import('./pages/scientific-notation-calculator/scientific-notation-calculator.component').then((m) => m.ScientificNotationCalculatorComponent),
      },
      {
        path: 'screen-resolution-simulator',
        loadComponent: () => import('./pages/screen-resolution-simulator/screen-resolution-simulator.component').then((m) => m.ScreenResolutionSimulatorComponent),
      },
      {
        path: 'security-txt-generator',
        loadComponent: () => import('./pages/security-txt-generator/security-txt-generator.component').then((m) => m.SecurityTxtGeneratorComponent),
      },
      {
        path: 'sepia-effect',
        loadComponent: () => import('./pages/sepia-effect/sepia-effect.component').then((m) => m.SepiaEffectComponent),
      },
      {
        path: 'serp-preview',
        loadComponent: () => import('./pages/serp-preview/serp-preview.component').then((m) => m.SerpPreviewComponent),
      },
      {
        path: 'sharpen-image',
        loadComponent: () => import('./pages/sharpen-image/sharpen-image.component').then((m) => m.SharpenImageComponent),
      },
      {
        path: 'hue-shifter',
        loadComponent: () => import('./pages/hue-shifter/hue-shifter.component').then((m) => m.HueShifterComponent),
      },
      {
        path: 'shoe-size-converter',
        loadComponent: () => import('./pages/shoe-size-converter/shoe-size-converter.component').then((m) => m.ShoeSizeConverterComponent),
      },
      {
        path: 'sig-figs-calculator',
        loadComponent: () => import('./pages/sig-figs-calculator/sig-figs-calculator.component').then((m) => m.SigFigsCalculatorComponent),
      },
      {
        path: 'sign-pdf',
        loadComponent: () => import('./pages/sign-pdf/sign-pdf.component').then((m) => m.SignPdfComponent),
      },
      {
        path: 'simple-interest-calculator',
        loadComponent: () => import('./pages/simple-interest-calculator/simple-interest-calculator.component').then((m) => m.SimpleInterestCalculatorComponent),
      },
      {
        path: 'sleep-calculator',
        loadComponent: () => import('./pages/sleep-calculator/sleep-calculator.component').then((m) => m.SleepCalculatorComponent),
      },
      {
        path: 'slope-calculator',
        loadComponent: () => import('./pages/slope-calculator/slope-calculator.component').then((m) => m.SlopeCalculatorComponent),
      },
      {
        path: 'snake-game',
        loadComponent: () => import('./pages/snake-game/snake-game.component').then((m) => m.SnakeGameComponent),
      },
      {
        path: 'sobriety-calculator',
        loadComponent: () => import('./pages/sobriety-calculator/sobriety-calculator.component').then((m) => m.SobrietyCalculatorComponent),
      },
      {
        path: 'open-graph-preview',
        loadComponent: () => import('./pages/open-graph-preview/open-graph-preview.component').then((m) => m.OpenGraphPreviewComponent),
      },
      {
        path: 'engagement-rate-calculator',
        loadComponent: () => import('./pages/engagement-rate-calculator/engagement-rate-calculator.component').then((m) => m.EngagementRateCalculatorComponent),
      },
      {
        path: 'social-security-calculator',
        loadComponent: () => import('./pages/social-security-calculator/social-security-calculator.component').then((m) => m.SocialSecurityCalculatorComponent),
      },
      {
        path: 'solarize-effect',
        loadComponent: () => import('./pages/solarize-effect/solarize-effect.component').then((m) => m.SolarizeEffectComponent),
      },
      {
        path: 'sort-list',
        loadComponent: () => import('./pages/sort-list/sort-list.component').then((m) => m.SortListComponent),
      },
      {
        path: 'sort-numbers',
        loadComponent: () => import('./pages/sort-numbers/sort-numbers.component').then((m) => m.SortNumbersComponent),
      },
      {
        path: 'speaker-cleaner',
        loadComponent: () => import('./pages/speaker-cleaner/speaker-cleaner.component').then((m) => m.SpeakerCleanerComponent),
      },
      {
        path: 'speaker-test',
        loadComponent: () => import('./pages/speaker-test/speaker-test.component').then((m) => m.SpeakerTestComponent),
      },
      {
        path: 'speed-calculator',
        loadComponent: () => import('./pages/speed-calculator/speed-calculator.component').then((m) => m.SpeedCalculatorComponent),
      },
      {
        path: 'speed-converter',
        loadComponent: () => import('./pages/speed-converter/speed-converter.component').then((m) => m.SpeedConverterComponent),
      },
      {
        path: 'speed-reader',
        loadComponent: () => import('./pages/speed-reader/speed-reader.component').then((m) => m.SpeedReaderComponent),
      },
      {
        path: 'spell-checker',
        loadComponent: () => import('./pages/spell-checker/spell-checker.component').then((m) => m.SpellCheckerComponent),
      },
      {
        path: 'spf-record-generator',
        loadComponent: () => import('./pages/spf-record-generator/spf-record-generator.component').then((m) => m.SpfRecordGeneratorComponent),
      },
      {
        path: 'spin-the-bottle',
        loadComponent: () => import('./pages/spin-the-bottle/spin-the-bottle.component').then((m) => m.SpinTheBottleComponent),
      },
      {
        path: 'split-complementary-color-generator',
        loadComponent: () => import('./pages/split-complementary-color-generator/split-complementary-color-generator.component').then((m) => m.SplitComplementaryColorGeneratorComponent),
      },
      {
        path: 'split-csv',
        loadComponent: () => import('./pages/split-csv/split-csv.component').then((m) => m.SplitCsvComponent),
      },
      {
        path: 'split-excel-workbook',
        loadComponent: () => import('./pages/split-excel-workbook/split-excel-workbook.component').then((m) => m.SplitExcelWorkbookComponent),
      },
      {
        path: 'split-files',
        loadComponent: () => import('./pages/split-files/split-files.component').then((m) => m.SplitFilesComponent),
      },
      {
        path: 'image-splitter',
        loadComponent: () => import('./pages/image-splitter/image-splitter.component').then((m) => m.ImageSplitterComponent),
      },
      {
        path: 'split-pdf',
        loadComponent: () => import('./pages/split-pdf/split-pdf.component').then((m) => m.SplitPdfComponent),
      },
      {
        path: 'css-sprite-generator',
        loadComponent: () => import('./pages/css-sprite-generator/css-sprite-generator.component').then((m) => m.CssSpriteGeneratorComponent),
      },
      {
        path: 'sql-formatter',
        loadComponent: () => import('./pages/sql-formatter/sql-formatter.component').then((m) => m.SqlFormatterComponent),
      },
      {
        path: 'sql-to-json',
        loadComponent: () => import('./pages/sql-to-json/sql-to-json.component').then((m) => m.SqlToJsonComponent),
      },
      {
        path: 'sqlite-database-viewer',
        loadComponent: () => import('./pages/sqlite-database-viewer/sqlite-database-viewer.component').then((m) => m.SqliteDatabaseViewerComponent),
      },
      {
        path: 'square-footage-calculator',
        loadComponent: () => import('./pages/square-footage-calculator/square-footage-calculator.component').then((m) => m.SquareFootageCalculatorComponent),
      },
      {
        path: 'sri-hash-generator',
        loadComponent: () => import('./pages/sri-hash-generator/sri-hash-generator.component').then((m) => m.SriHashGeneratorComponent),
      },
      {
        path: 'ssl-certificate-decoder',
        loadComponent: () => import('./pages/ssl-certificate-decoder/ssl-certificate-decoder.component').then((m) => m.SslCertificateDecoderComponent),
      },
      {
        path: 'stair-calculator',
        loadComponent: () => import('./pages/stair-calculator/stair-calculator.component').then((m) => m.StairCalculatorComponent),
      },
      {
        path: 'standard-deviation-calculator',
        loadComponent: () => import('./pages/standard-deviation-calculator/standard-deviation-calculator.component').then((m) => m.StandardDeviationCalculatorComponent),
      },
      {
        path: 'statistics-calculator',
        loadComponent: () => import('./pages/statistics-calculator/statistics-calculator.component').then((m) => m.StatisticsCalculatorComponent),
      },
      {
        path: 'steps-to-miles-calculator',
        loadComponent: () => import('./pages/steps-to-miles-calculator/steps-to-miles-calculator.component').then((m) => m.StepsToMilesCalculatorComponent),
      },
      {
        path: 'stock-average-calculator',
        loadComponent: () => import('./pages/stock-average-calculator/stock-average-calculator.component').then((m) => m.StockAverageCalculatorComponent),
      },
      {
        path: 'stock-inventory-tracker',
        loadComponent: () => import('./pages/stock-inventory-tracker/stock-inventory-tracker.component').then((m) => m.StockInventoryTrackerComponent),
      },
      {
        path: 'online-stopwatch',
        loadComponent: () => import('./pages/online-stopwatch/online-stopwatch.component').then((m) => m.OnlineStopwatchComponent),
      },
      {
        path: 'strip-html-tags',
        loadComponent: () => import('./pages/strip-html-tags/strip-html-tags.component').then((m) => m.StripHtmlTagsComponent),
      },
      {
        path: 'student-loan-calculator',
        loadComponent: () => import('./pages/student-loan-calculator/student-loan-calculator.component').then((m) => m.StudentLoanCalculatorComponent),
      },
      {
        path: 'subtitle-converter',
        loadComponent: () => import('./pages/subtitle-converter/subtitle-converter.component').then((m) => m.SubtitleConverterComponent),
      },
      {
        path: 'subtract-from-a-date',
        loadComponent: () => import('./pages/subtract-from-a-date/subtract-from-a-date.component').then((m) => m.SubtractFromADateComponent),
      },
      {
        path: 'sunrise-sunset-calculator',
        loadComponent: () => import('./pages/sunrise-sunset-calculator/sunrise-sunset-calculator.component').then((m) => m.SunriseSunsetCalculatorComponent),
      },
      {
        path: 'surface-area-calculator',
        loadComponent: () => import('./pages/surface-area-calculator/surface-area-calculator.component').then((m) => m.SurfaceAreaCalculatorComponent),
      },
      {
        path: 'svg-blob-generator',
        loadComponent: () => import('./pages/svg-blob-generator/svg-blob-generator.component').then((m) => m.SvgBlobGeneratorComponent),
      },
      {
        path: 'svg-converter',
        loadComponent: () => import('./pages/svg-converter/svg-converter.component').then((m) => m.SvgConverterComponent),
      },
      {
        path: 'svg-editor',
        loadComponent: () => import('./pages/svg-editor/svg-editor.component').then((m) => m.SvgEditorComponent),
      },
      {
        path: 'svg-pattern-generator',
        loadComponent: () => import('./pages/svg-pattern-generator/svg-pattern-generator.component').then((m) => m.SvgPatternGeneratorComponent),
      },
      {
        path: 'svg-rasterizer',
        loadComponent: () => import('./pages/svg-rasterizer/svg-rasterizer.component').then((m) => m.SvgRasterizerComponent),
      },
      {
        path: 'svg-stroke-to-fill',
        loadComponent: () => import('./pages/svg-stroke-to-fill/svg-stroke-to-fill.component').then((m) => m.SvgStrokeToFillComponent),
      },
      {
        path: 'svg-to-jsx-converter',
        loadComponent: () => import('./pages/svg-to-jsx-converter/svg-to-jsx-converter.component').then((m) => m.SvgToJsxConverterComponent),
      },
      {
        path: 'svg-to-png-converter',
        loadComponent: () => import('./pages/svg-to-png-converter/svg-to-png-converter.component').then((m) => m.SvgToPngConverterComponent),
      },
      {
        path: 'svg-optimizer',
        loadComponent: () => import('./pages/svg-optimizer/svg-optimizer.component').then((m) => m.SvgOptimizerComponent),
      },
      {
        path: 'svg-wave-divider-generator',
        loadComponent: () => import('./pages/svg-wave-divider-generator/svg-wave-divider-generator.component').then((m) => m.SvgWaveDividerGeneratorComponent),
      },
      {
        path: 'syntax-highlighter',
        loadComponent: () => import('./pages/syntax-highlighter/syntax-highlighter.component').then((m) => m.SyntaxHighlighterComponent),
      },
      {
        path: 'take-home-pay-calculator',
        loadComponent: () => import('./pages/take-home-pay-calculator/take-home-pay-calculator.component').then((m) => m.TakeHomePayCalculatorComponent),
      },
      {
        path: 'tap-tempo',
        loadComponent: () => import('./pages/tap-tempo/tap-tempo.component').then((m) => m.TapTempoComponent),
      },
      {
        path: 'target-heart-rate-calculator',
        loadComponent: () => import('./pages/target-heart-rate-calculator/target-heart-rate-calculator.component').then((m) => m.TargetHeartRateCalculatorComponent),
      },
      {
        path: 'tasbih-dhikr-counter',
        loadComponent: () => import('./pages/tasbih-dhikr-counter/tasbih-dhikr-counter.component').then((m) => m.TasbihDhikrCounterComponent),
      },
      {
        path: 'tdee-calculator',
        loadComponent: () => import('./pages/tdee-calculator/tdee-calculator.component').then((m) => m.TdeeCalculatorComponent),
      },
      {
        path: 'teleprompter',
        loadComponent: () => import('./pages/teleprompter/teleprompter.component').then((m) => m.TeleprompterComponent),
      },
      {
        path: 'temperature-converter',
        loadComponent: () => import('./pages/temperature-converter/temperature-converter.component').then((m) => m.TemperatureConverterComponent),
      },
      {
        path: 'diff-checker',
        loadComponent: () => import('./pages/diff-checker/diff-checker.component').then((m) => m.DiffCheckerComponent),
      },
      {
        path: 'text-repeater',
        loadComponent: () => import('./pages/text-repeater/text-repeater.component').then((m) => m.TextRepeaterComponent),
      },
      {
        path: 'text-to-binary-converter',
        loadComponent: () => import('./pages/text-to-binary-converter/text-to-binary-converter.component').then((m) => m.TextToBinaryConverterComponent),
      },
      {
        path: 'text-to-handwriting',
        loadComponent: () => import('./pages/text-to-handwriting/text-to-handwriting.component').then((m) => m.TextToHandwritingComponent),
      },
      {
        path: 'text-to-image-converter',
        loadComponent: () => import('./pages/text-to-image-converter/text-to-image-converter.component').then((m) => m.TextToImageConverterComponent),
      },
      {
        path: 'text-to-speech',
        loadComponent: () => import('./pages/text-to-speech/text-to-speech.component').then((m) => m.TextToSpeechComponent),
      },
      {
        path: 'image-threshold-filter',
        loadComponent: () => import('./pages/image-threshold-filter/image-threshold-filter.component').then((m) => m.ImageThresholdFilterComponent),
      },
      {
        path: 'tic-tac-toe',
        loadComponent: () => import('./pages/tic-tac-toe/tic-tac-toe.component').then((m) => m.TicTacToeComponent),
      },
      {
        path: 'tile-calculator',
        loadComponent: () => import('./pages/tile-calculator/tile-calculator.component').then((m) => m.TileCalculatorComponent),
      },
      {
        path: 'tilt-shift-effect',
        loadComponent: () => import('./pages/tilt-shift-effect/tilt-shift-effect.component').then((m) => m.TiltShiftEffectComponent),
      },
      {
        path: 'time-and-a-half-calculator',
        loadComponent: () => import('./pages/time-and-a-half-calculator/time-and-a-half-calculator.component').then((m) => m.TimeAndAHalfCalculatorComponent),
      },
      {
        path: 'time-duration-calculator',
        loadComponent: () => import('./pages/time-duration-calculator/time-duration-calculator.component').then((m) => m.TimeDurationCalculatorComponent),
      },
      {
        path: 'time-unit-converter',
        loadComponent: () => import('./pages/time-unit-converter/time-unit-converter.component').then((m) => m.TimeUnitConverterComponent),
      },
      {
        path: 'time-zone-converter',
        loadComponent: () => import('./pages/time-zone-converter/time-zone-converter.component').then((m) => m.TimeZoneConverterComponent),
      },
      {
        path: 'online-timer',
        loadComponent: () => import('./pages/online-timer/online-timer.component').then((m) => m.OnlineTimerComponent),
      },
      {
        path: 'tints-shades-generator',
        loadComponent: () => import('./pages/tints-shades-generator/tints-shades-generator.component').then((m) => m.TintsShadesGeneratorComponent),
      },
      {
        path: 'tip-calculator',
        loadComponent: () => import('./pages/tip-calculator/tip-calculator.component').then((m) => m.TipCalculatorComponent),
      },
      {
        path: 'tire-size-calculator',
        loadComponent: () => import('./pages/tire-size-calculator/tire-size-calculator.component').then((m) => m.TireSizeCalculatorComponent),
      },
      {
        path: 'tone-generator',
        loadComponent: () => import('./pages/tone-generator/tone-generator.component').then((m) => m.ToneGeneratorComponent),
      },
      {
        path: 'torque-converter',
        loadComponent: () => import('./pages/torque-converter/torque-converter.component').then((m) => m.TorqueConverterComponent),
      },
      {
        path: 'touchscreen-test',
        loadComponent: () => import('./pages/touchscreen-test/touchscreen-test.component').then((m) => m.TouchscreenTestComponent),
      },
      {
        path: 'transistor-bias-calculator',
        loadComponent: () => import('./pages/transistor-bias-calculator/transistor-bias-calculator.component').then((m) => m.TransistorBiasCalculatorComponent),
      },
      {
        path: 'triadic-tetradic-color-generator',
        loadComponent: () => import('./pages/triadic-tetradic-color-generator/triadic-tetradic-color-generator.component').then((m) => m.TriadicTetradicColorGeneratorComponent),
      },
      {
        path: 'triangle-calculator',
        loadComponent: () => import('./pages/triangle-calculator/triangle-calculator.component').then((m) => m.TriangleCalculatorComponent),
      },
      {
        path: 'truth-or-dare-generator',
        loadComponent: () => import('./pages/truth-or-dare-generator/truth-or-dare-generator.component').then((m) => m.TruthOrDareGeneratorComponent),
      },
      {
        path: 'uk-mortgage-calculator',
        loadComponent: () => import('./pages/uk-mortgage-calculator/uk-mortgage-calculator.component').then((m) => m.UkMortgageCalculatorComponent),
      },
      {
        path: 'ulid-generator',
        loadComponent: () => import('./pages/ulid-generator/ulid-generator.component').then((m) => m.UlidGeneratorComponent),
      },
      {
        path: 'unicode-encoder-decoder',
        loadComponent: () => import('./pages/unicode-encoder-decoder/unicode-encoder-decoder.component').then((m) => m.UnicodeEncoderDecoderComponent),
      },
      {
        path: 'unlock-pdf',
        loadComponent: () => import('./pages/unlock-pdf/unlock-pdf.component').then((m) => m.UnlockPdfComponent),
      },
      {
        path: 'url-encoder-decoder',
        loadComponent: () => import('./pages/url-encoder-decoder/url-encoder-decoder.component').then((m) => m.UrlEncoderDecoderComponent),
      },
      {
        path: 'url-parser',
        loadComponent: () => import('./pages/url-parser/url-parser.component').then((m) => m.UrlParserComponent),
      },
      {
        path: 'url-slug-generator',
        loadComponent: () => import('./pages/url-slug-generator/url-slug-generator.component').then((m) => m.UrlSlugGeneratorComponent),
      },
      {
        path: 'user-agent-parser',
        loadComponent: () => import('./pages/user-agent-parser/user-agent-parser.component').then((m) => m.UserAgentParserComponent),
      },
      {
        path: 'utm-builder',
        loadComponent: () => import('./pages/utm-builder/utm-builder.component').then((m) => m.UtmBuilderComponent),
      },
      {
        path: 'uuid-generator',
        loadComponent: () => import('./pages/uuid-generator/uuid-generator.component').then((m) => m.UuidGeneratorComponent),
      },
      {
        path: 'va-mortgage-calculator',
        loadComponent: () => import('./pages/va-mortgage-calculator/va-mortgage-calculator.component').then((m) => m.VaMortgageCalculatorComponent),
      },
      {
        path: 'vat-calculator',
        loadComponent: () => import('./pages/vat-calculator/vat-calculator.component').then((m) => m.VatCalculatorComponent),
      },
      {
        path: 'vibration-test',
        loadComponent: () => import('./pages/vibration-test/vibration-test.component').then((m) => m.VibrationTestComponent),
      },
      {
        path: 'video-screenshot',
        loadComponent: () => import('./pages/video-screenshot/video-screenshot.component').then((m) => m.VideoScreenshotComponent),
      },
      {
        path: 'vignette-effect',
        loadComponent: () => import('./pages/vignette-effect/vignette-effect.component').then((m) => m.VignetteEffectComponent),
      },
      {
        path: 'voltage-converter',
        loadComponent: () => import('./pages/voltage-converter/voltage-converter.component').then((m) => m.VoltageConverterComponent),
      },
      {
        path: 'voltage-drop-calculator',
        loadComponent: () => import('./pages/voltage-drop-calculator/voltage-drop-calculator.component').then((m) => m.VoltageDropCalculatorComponent),
      },
      {
        path: 'volume-calculator',
        loadComponent: () => import('./pages/volume-calculator/volume-calculator.component').then((m) => m.VolumeCalculatorComponent),
      },
      {
        path: 'volume-converter',
        loadComponent: () => import('./pages/volume-converter/volume-converter.component').then((m) => m.VolumeConverterComponent),
      },
      {
        path: 'walking-time-calculator',
        loadComponent: () => import('./pages/walking-time-calculator/walking-time-calculator.component').then((m) => m.WalkingTimeCalculatorComponent),
      },
      {
        path: 'watermark-pdf',
        loadComponent: () => import('./pages/watermark-pdf/watermark-pdf.component').then((m) => m.WatermarkPdfComponent),
      },
      {
        path: 'web-app-manifest-generator',
        loadComponent: () => import('./pages/web-app-manifest-generator/web-app-manifest-generator.component').then((m) => m.WebAppManifestGeneratorComponent),
      },
      {
        path: 'webcam-test',
        loadComponent: () => import('./pages/webcam-test/webcam-test.component').then((m) => m.WebcamTestComponent),
      },
      {
        path: 'responsive-website-tester',
        loadComponent: () => import('./pages/responsive-website-tester/responsive-website-tester.component').then((m) => m.ResponsiveWebsiteTesterComponent),
      },
      {
        path: 'weight-calculator',
        loadComponent: () => import('./pages/weight-calculator/weight-calculator.component').then((m) => m.WeightCalculatorComponent),
      },
      {
        path: 'weight-converter',
        loadComponent: () => import('./pages/weight-converter/weight-converter.component').then((m) => m.WeightConverterComponent),
      },
      {
        path: 'weight-on-planets-calculator',
        loadComponent: () => import('./pages/weight-on-planets-calculator/weight-on-planets-calculator.component').then((m) => m.WeightOnPlanetsCalculatorComponent),
      },
      {
        path: 'weight-watchers-points-calculator',
        loadComponent: () => import('./pages/weight-watchers-points-calculator/weight-watchers-points-calculator.component').then((m) => m.WeightLossPointsCalculatorComponent),
      },
      {
        path: 'what-is-my-browser',
        loadComponent: () => import('./pages/what-is-my-browser/what-is-my-browser.component').then((m) => m.WhatIsMyBrowserComponent),
      },
      {
        path: 'whatsapp-text-formatter',
        loadComponent: () => import('./pages/whatsapp-text-formatter/whatsapp-text-formatter.component').then((m) => m.WhatsappTextFormatterComponent),
      },
      {
        path: 'online-whiteboard',
        loadComponent: () => import('./pages/online-whiteboard/online-whiteboard.component').then((m) => m.OnlineWhiteboardComponent),
      },
      {
        path: 'whitespace-remover',
        loadComponent: () => import('./pages/whitespace-remover/whitespace-remover.component').then((m) => m.WhitespaceRemoverComponent),
      },
      {
        path: 'waist-to-hip-ratio-calculator',
        loadComponent: () => import('./pages/waist-to-hip-ratio-calculator/waist-to-hip-ratio-calculator.component').then((m) => m.WaistToHipRatioCalculatorComponent),
      },
      {
        path: 'wifi-qr-code-generator',
        loadComponent: () => import('./pages/wifi-qr-code-generator/wifi-qr-code-generator.component').then((m) => m.WifiQrCodeGeneratorComponent),
      },
      {
        path: 'wind-chill-calculator',
        loadComponent: () => import('./pages/wind-chill-calculator/wind-chill-calculator.component').then((m) => m.WindChillCalculatorComponent),
      },
      {
        path: 'word-combiner',
        loadComponent: () => import('./pages/word-combiner/word-combiner.component').then((m) => m.WordCombinerComponent),
      },
      {
        path: 'world-clock',
        loadComponent: () => import('./pages/world-clock/world-clock.component').then((m) => m.WorldClockComponent),
      },
      {
        path: 'xirr-calculator',
        loadComponent: () => import('./pages/xirr-calculator/xirr-calculator.component').then((m) => m.XirrCalculatorComponent),
      },
      {
        path: 'xml-formatter',
        loadComponent: () => import('./pages/xml-formatter/xml-formatter.component').then((m) => m.XmlFormatterComponent),
      },
      {
        path: 'xml-inspector',
        loadComponent: () => import('./pages/xml-inspector/xml-inspector.component').then((m) => m.XmlInspectorComponent),
      },
      {
        path: 'xml-sitemap-generator',
        loadComponent: () => import('./pages/xml-sitemap-generator/xml-sitemap-generator.component').then((m) => m.XmlSitemapGeneratorComponent),
      },
      {
        path: 'xml-to-csv',
        loadComponent: () => import('./pages/xml-to-csv/xml-to-csv.component').then((m) => m.XmlToCsvComponent),
      },
      {
        path: 'xml-to-excel',
        loadComponent: () => import('./pages/xml-to-excel/xml-to-excel.component').then((m) => m.XmlToExcelComponent),
      },
      {
        path: 'xml-to-json',
        loadComponent: () => import('./pages/xml-to-json/xml-to-json.component').then((m) => m.XmlToJsonComponent),
      },
      {
        path: 'yaml-formatter',
        loadComponent: () => import('./pages/yaml-formatter/yaml-formatter.component').then((m) => m.YamlFormatterComponent),
      },
      {
        path: 'yaml-to-json',
        loadComponent: () => import('./pages/yaml-to-json/yaml-to-json.component').then((m) => m.YamlToJsonComponent),
      },
      {
        path: 'youtube-thumbnail-downloader',
        loadComponent: () => import('./pages/youtube-thumbnail-downloader/youtube-thumbnail-downloader.component').then((m) => m.YoutubeThumbnailDownloaderComponent),
      },
      {
        path: 'z-score-calculator',
        loadComponent: () => import('./pages/z-score-calculator/z-score-calculator.component').then((m) => m.ZScoreCalculatorComponent),
      },
      {
        path: 'zakat-calculator',
        loadComponent: () => import('./pages/zakat-calculator/zakat-calculator.component').then((m) => m.ZakatCalculatorComponent),
      },
      {
        path: 'zalgo-text-generator',
        loadComponent: () => import('./pages/zalgo-text-generator/zalgo-text-generator.component').then((m) => m.ZalgoTextGeneratorComponent),
      },
      {
        path: 'sun-position-calculator',
        loadComponent: () => import('./pages/sun-position-calculator/sun-position-calculator.component').then((m) => m.SunPositionCalculatorComponent),
      },
      {
        path: 'zero-coupon-bond-calculator',
        loadComponent: () => import('./pages/zero-coupon-bond-calculator/zero-coupon-bond-calculator.component').then((m) => m.ZeroCouponBondCalculatorComponent),
      },
      {
        path: 'zero-width-character-remover',
        loadComponent: () => import('./pages/zero-width-character-remover/zero-width-character-remover.component').then((m) => m.ZeroWidthCharacterRemoverComponent),
      },
      {
        path: 'zip-archive-content-viewer',
        loadComponent: () => import('./pages/zip-archive-content-viewer/zip-archive-content-viewer.component').then((m) => m.ZipArchiveContentViewerComponent),
      },
      {
        path: 'zip-code-format-validator',
        loadComponent: () => import('./pages/zip-code-format-validator/zip-code-format-validator.component').then((m) => m.ZipCodeFormatValidatorComponent),
      },
      {
        path: 'unzip-files-online',
        loadComponent: () => import('./pages/unzip-files-online/unzip-files-online.component').then((m) => m.UnzipFilesOnlineComponent),
      },
      {
        path: 'zodiac-sign-calculator',
        loadComponent: () => import('./pages/zodiac-sign-calculator/zodiac-sign-calculator.component').then((m) => m.ZodiacSignCalculatorComponent),
      },
      {
        path: 'zoom-level-to-map-scale-calculator',
        loadComponent: () => import('./pages/zoom-level-to-map-scale-calculator/zoom-level-to-map-scale-calculator.component').then((m) => m.ZoomLevelToMapScaleCalculatorComponent),
      },
      { path: '**', loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent) },
    ],
  },
  { path: '**', redirectTo: '/en' },
];
