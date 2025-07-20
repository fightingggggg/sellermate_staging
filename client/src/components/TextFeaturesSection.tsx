const TextFeaturesSection = () => {
  return (
    <section id="textfeatures" className="py-24 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <div className="text-xl md:text-3xl font-bold leading-snug md:leading-tight space-y-2 md:space-y-3">
            {/* ✅ 모바일 전용 줄바꿈 */}
            <div className="md:hidden space-y-1">
              <p>스마트스토어,</p>
              <p>지금보다 더 많이 노출되고</p>
              <p>판매 될 수 있어요</p>
              <br />
              <p>광고 없이도</p>
              <p>상위 노출을 실현하는 최적화 솔루션</p>
              <p>하나면 충분해요</p>
            </div>

            {/* ✅ 데스크탑 전용 */}
            <div className="hidden md:block space-y-3">
              <p>스마트스토어, 지금보다 더 많이 노출되고 판매 될 수 있어요</p>
              <p>광고 없이도 상위 노출을 실현하는 최적화 솔루션 하나면 충분해요</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TextFeaturesSection;
